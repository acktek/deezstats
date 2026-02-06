/**
 * Edge Detection Algorithm v2 for Live Betting
 *
 * The core thesis: Sportsbooks anchor live lines to historical data.
 * For players with limited sample sizes (rookies, role players, early-season),
 * their adjustments lag behind reality.
 *
 * EDGE = (BAYESIAN_PACE × POISSON_CONFIDENCE × USAGE_MULT × PACE_NORM × DATA_SCARCITY × GAME_TIMING) - VARIANCE_PENALTY
 *
 * Key improvements over v1:
 * - Bayesian pace projection blending season avg with live pace
 * - Poisson confidence for rare events (steals, blocks, 3PT, TDs)
 * - Blowout detection reduces effective expected minutes
 * - Foul trouble detection reduces effective expected minutes (NBA)
 * - Sigmoid dampening (fades more naturally than linear)
 * - Exponential game timing (early-game value decays faster)
 * - Usage rate multiplier (NBA advanced stats)
 * - Game pace normalization (NBA advanced stats)
 */

/**
 * Stat-type dampening factors for early-game noise reduction.
 * Higher values = more dampening = less trust in early projections.
 */
const STAT_DAMPENING: Record<string, number> = {
  // NBA
  points: 1.0,          // reliable accumulator
  rebounds: 1.3,        // more bursty than assumed
  assists: 1.2,         // fairly steady for playmakers
  three_pointers: 2.0,  // hot shooting rarely sustains
  steals: 2.5,          // Poisson events
  blocks: 2.5,          // Poisson events

  // NFL
  passing_yards: 1.0,   // accumulates steadily
  rushing_yards: 1.2,   // can be game-script dependent
  receiving_yards: 1.3, // target-dependent
  receptions: 1.25,     // target-dependent
  touchdowns: 2.0,      // rare events, very noisy
};

/** Stat types that are rare/discrete events suitable for Poisson modeling */
const POISSON_STAT_TYPES = new Set([
  "steals", "blocks", "three_pointers", "touchdowns",
]);

export interface EdgeInput {
  currentValue: number;
  gameElapsedPercent: number;
  pregameLine: number;
  gamesPlayed: number;
  historicalStddev?: number;
  isRookie?: boolean;
  minutesPlayed?: number;
  expectedMinutes?: number;
  statType?: string;
  // New v2 fields (all optional for backward compatibility)
  scoreDifferential?: number;   // abs(homeScore - awayScore)
  period?: number;              // current period (1-4, 5+ OT)
  personalFouls?: number;       // player's PFs this game (NBA)
  seasonAverage?: number;       // per-stat-type season avg
  usagePercentage?: number;     // from BDL advanced stats (0-100)
  gamePace?: number;            // possessions per 48 min
  sport?: "nba" | "nfl";
}

export interface EdgeResult {
  edgeScore: number;
  pace: number;
  projectedFinal: number;
  signal: "none" | "monitor" | "good" | "strong";
  components: {
    paceRatio: number;
    adjustedPaceRatio: number;
    statDampening: number;
    dataScarcity: number;
    gameTiming: number;
    variancePenalty: number;
    bayesianProjection: number;
    blowoutFactor: number;
    usageMultiplier: number;
    gamePaceMultiplier: number;
    poissonConfidence: number;
    foulTroubleReduction: number;
    effectiveExpectedMinutes: number;
  };
}

// ============ Helper Functions ============

/**
 * Poisson CDF: P(X <= k) for Poisson distribution with rate lambda.
 * Uses iterative computation to avoid factorial overflow.
 */
function poissonCDF(k: number, lambda: number): number {
  if (lambda <= 0) return 1;
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= Math.floor(k); i++) {
    sum += term;
    term *= lambda / (i + 1);
  }
  return Math.min(1, sum);
}

/**
 * Poisson confidence multiplier for rare events.
 * Computes P(remaining events >= needed to hit line) and scales to [0.3, 1.5].
 */
function getPoissonConfidence(
  currentValue: number,
  line: number,
  playerProgress: number,
  statType?: string,
): number {
  if (!statType || !POISSON_STAT_TYPES.has(statType)) return 1.0;
  if (playerProgress <= 0 || playerProgress >= 1) return 1.0;

  const remaining = Math.max(0, line - currentValue);
  const remainingProgress = 1 - playerProgress;

  // Estimate expected remaining events based on current pace
  const currentRate = playerProgress > 0.05 ? currentValue / playerProgress : 0;
  const expectedRemaining = currentRate * remainingProgress;

  if (expectedRemaining <= 0 && remaining > 0) return 0.3;
  if (remaining <= 0) return 1.5;

  // P(X >= remaining) = 1 - P(X <= remaining - 1)
  const pOver = 1 - poissonCDF(remaining - 1, expectedRemaining);

  // Scale to confidence multiplier: P(over) * 2.0, clamped to [0.3, 1.5]
  return Math.max(0.3, Math.min(1.5, pOver * 2.0));
}

/**
 * Blowout factor: reduces effective expected minutes when game is a blowout.
 * Returns multiplier on expected minutes (1.0 = no reduction).
 */
function getBlowoutFactor(
  scoreDifferential?: number,
  period?: number,
): number {
  if (scoreDifferential === undefined || period === undefined) return 1.0;

  // Q3+ (period >= 3)
  if (period >= 3) {
    if (scoreDifferential > 25) return 0.30; // 70% reduction
    if (scoreDifferential > 20) return 0.60; // 40% reduction
  }

  // Q4 (period >= 4) — less extreme leads still matter
  if (period >= 4) {
    if (scoreDifferential > 15) return 0.50; // 50% reduction
  }

  return 1.0;
}

/**
 * Foul trouble reduction: reduces effective expected minutes for players in foul trouble.
 * NBA only — returns multiplier on expected minutes (1.0 = no reduction).
 */
function getFoulTroubleReduction(
  personalFouls?: number,
  period?: number,
  sport?: "nba" | "nfl",
): number {
  if (sport !== "nba" || personalFouls === undefined || period === undefined) return 1.0;

  // Before Q4 (period < 4)
  if (period < 4) {
    if (personalFouls >= 5) return 0.50; // 50% reduction
    if (personalFouls >= 4) return 0.75; // 25% reduction
  }

  return 1.0;
}

/**
 * Bayesian pace projection: blends season average with current pace.
 * Falls back to linear extrapolation if no season average provided.
 */
function getBayesianProjection(
  currentValue: number,
  playerProgress: number,
  minutesPlayed: number | undefined,
  seasonAverage?: number,
): number {
  const currentPace = playerProgress > 0 ? currentValue / playerProgress : 0;

  if (seasonAverage === undefined || seasonAverage <= 0) {
    return currentPace;
  }

  // Evidence weight scales with minutes played (12 min = full weight of 1 evidence unit)
  const evidenceWeight = (minutesPlayed ?? 0) / 12;
  const priorWeight = 2.0;

  return (priorWeight * seasonAverage + evidenceWeight * currentPace) / (priorWeight + evidenceWeight);
}

/**
 * Sigmoid dampening: replaces linear dampening fade.
 * Returns a value from ~0 (heavy dampening) to ~1 (no dampening).
 * Transition centered at 40% game progress.
 */
function getSigmoidDampening(
  baseDampening: number,
  playerProgress: number,
): number {
  const sigmoid = 1 / (1 + Math.exp(-10 * (playerProgress - 0.4)));
  // At progress=0: sigmoid≈0, so dampening = baseDampening (full)
  // At progress=1: sigmoid≈1, so dampening = 1.0 (none)
  return 1 + (baseDampening - 1) * (1 - sigmoid);
}

/**
 * Exponential game timing: early-game opportunities are more valuable.
 * Decays from 1.0 to 0.4 as game progresses (vs linear 1.0→0.5 in v1).
 */
function getExponentialGameTiming(playerProgress: number): number {
  return 0.4 + 0.6 * Math.exp(-3 * playerProgress);
}

/**
 * Usage rate multiplier: higher usage = more opportunity to hit overs.
 * NBA only, defaults to 1.0 when not available.
 */
function getUsageMultiplier(
  usagePercentage?: number,
  sport?: "nba" | "nfl",
): number {
  if (sport !== "nba" || usagePercentage === undefined) return 1.0;
  // Scale: 0% usage → 0.7x, 100% usage → 2.2x
  return 0.7 + (usagePercentage / 100) * 1.5;
}

/**
 * Game pace normalization: faster games = more possessions = more opportunity.
 * NBA only, defaults to 1.0 when not available.
 * League average pace ~100 possessions/48min.
 */
function getGamePaceMultiplier(
  gamePace?: number,
  sport?: "nba" | "nfl",
): number {
  if (sport !== "nba" || gamePace === undefined) return 1.0;
  return gamePace / 100;
}

// ============ Main Algorithm ============

export function calculateEdgeScore(input: EdgeInput): EdgeResult {
  const {
    currentValue,
    gameElapsedPercent,
    pregameLine,
    gamesPlayed,
    historicalStddev = 0,
    isRookie = false,
    minutesPlayed,
    expectedMinutes,
    statType,
    scoreDifferential,
    period,
    personalFouls,
    seasonAverage,
    usagePercentage,
    gamePace,
    sport,
  } = input;

  // Avoid division by zero
  const line = Math.max(pregameLine, 0.1);

  // 1. Effective Expected Minutes — blowout + foul trouble reduce projected time
  const blowoutFactor = getBlowoutFactor(scoreDifferential, period);
  const foulTroubleReduction = getFoulTroubleReduction(personalFouls, period, sport);
  const minutesReduction = Math.min(blowoutFactor, foulTroubleReduction);
  const effectiveExpectedMinutes = (expectedMinutes ?? 0) * minutesReduction;

  // 2. Player Progress — prefer minutes-based if available
  let playerProgress: number;
  if (minutesPlayed !== undefined && effectiveExpectedMinutes > 0) {
    playerProgress = Math.max(minutesPlayed / effectiveExpectedMinutes, 0.01);
  } else if (minutesPlayed !== undefined && expectedMinutes && expectedMinutes > 0) {
    // Fallback to original expected minutes if no reduction applies
    playerProgress = Math.max(minutesPlayed / expectedMinutes, 0.01);
  } else {
    playerProgress = Math.max(gameElapsedPercent, 1) / 100;
  }

  // 3. Bayesian Pace Projection
  const bayesianProjection = getBayesianProjection(
    currentValue, playerProgress, minutesPlayed, seasonAverage,
  );
  const pace = currentValue / Math.max(playerProgress, 0.01);
  const projectedFinal = bayesianProjection;

  // 4. Pace Ratio
  const paceRatio = bayesianProjection / line;

  // 5. Sigmoid Dampening
  const baseDampening = statType ? (STAT_DAMPENING[statType] ?? 1.0) : 1.0;
  const statDampening = getSigmoidDampening(baseDampening, playerProgress);
  const adjustedPaceRatio = paceRatio / statDampening;

  // 6. Poisson Confidence (rare events only, 1.0 for volume stats)
  const poissonConfidence = getPoissonConfidence(currentValue, line, playerProgress, statType);

  // 7. Usage Multiplier (NBA only)
  const usageMultiplier = getUsageMultiplier(usagePercentage, sport);

  // 8. Game Pace Normalization (NBA only)
  const gamePaceMultiplier = getGamePaceMultiplier(gamePace, sport);

  // 9. Data Scarcity — unchanged from v1
  const baseScarcity = 1 + 1 / Math.sqrt(gamesPlayed + 1);
  const dataScarcity = isRookie ? baseScarcity * 1.2 : baseScarcity;

  // 10. Game Timing — exponential decay
  const gameTiming = getExponentialGameTiming(playerProgress);

  // 11. Variance Penalty — unchanged from v1
  const variancePenalty = historicalStddev > 0 ? historicalStddev / line : 0;

  // 12. Final score
  const rawScore =
    adjustedPaceRatio *
    poissonConfidence *
    usageMultiplier *
    gamePaceMultiplier *
    dataScarcity *
    gameTiming -
    variancePenalty;

  const edgeScore = Math.max(0, Math.min(rawScore, 10));
  const signal = getSignal(edgeScore);

  return {
    edgeScore,
    pace,
    projectedFinal,
    signal,
    components: {
      paceRatio,
      adjustedPaceRatio,
      statDampening,
      dataScarcity,
      gameTiming,
      variancePenalty,
      bayesianProjection,
      blowoutFactor,
      usageMultiplier,
      gamePaceMultiplier,
      poissonConfidence,
      foulTroubleReduction,
      effectiveExpectedMinutes,
    },
  };
}

function getSignal(score: number): EdgeResult["signal"] {
  if (score < 1.5) return "none";
  if (score < 2.0) return "monitor";
  if (score < 3.0) return "good";
  return "strong";
}

/**
 * Alert Thresholds
 * < 1.5 - No edge (don't track)
 * 1.5 - 2.0 - Monitor (yellow)
 * 2.0 - 3.0 - Good opportunity (green)
 * > 3.0 - Strong edge, act fast (gold/highlight)
 */
export const EDGE_THRESHOLDS = {
  NONE: 1.5,
  MONITOR: 2.0,
  GOOD: 3.0,
} as const;

/**
 * Check if an edge score should trigger an alert
 */
export function shouldAlert(
  edgeScore: number,
  previousScore?: number
): boolean {
  // Alert if crossing into "good" territory
  if (edgeScore >= EDGE_THRESHOLDS.MONITOR) {
    // If we have a previous score, only alert on threshold crossings
    if (previousScore !== undefined) {
      const crossedToGood =
        previousScore < EDGE_THRESHOLDS.MONITOR &&
        edgeScore >= EDGE_THRESHOLDS.MONITOR;
      const crossedToStrong =
        previousScore < EDGE_THRESHOLDS.GOOD &&
        edgeScore >= EDGE_THRESHOLDS.GOOD;
      return crossedToGood || crossedToStrong;
    }
    return true;
  }
  return false;
}

/**
 * Generate a human-readable alert message
 */
export function generateAlertMessage(
  playerName: string,
  statType: string,
  result: EdgeResult,
  pregameLine: number
): string {
  const statLabel = formatStatType(statType);
  const signalEmoji =
    result.signal === "strong"
      ? "🔥"
      : result.signal === "good"
        ? "✅"
        : "👀";

  return `${signalEmoji} ${playerName} - ${statLabel}\nOn pace: ${result.pace.toFixed(1)} (Line: ${pregameLine})\nEdge Score: ${result.edgeScore.toFixed(2)}`;
}

function formatStatType(statType: string): string {
  const labels: Record<string, string> = {
    receiving_yards: "Receiving Yards",
    rushing_yards: "Rushing Yards",
    receptions: "Receptions",
    passing_yards: "Passing Yards",
    touchdowns: "Touchdowns",
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    three_pointers: "3-Pointers Made",
    steals: "Steals",
    blocks: "Blocks",
  };
  return labels[statType] || statType;
}

/**
 * Batch calculate edges for multiple players
 */
export function calculateBatchEdges(
  players: Array<{
    playerId: string;
    playerName: string;
    statType: string;
    input: EdgeInput;
  }>
): Array<{
  playerId: string;
  playerName: string;
  statType: string;
  result: EdgeResult;
}> {
  return players
    .map((player) => ({
      ...player,
      result: calculateEdgeScore(player.input),
    }))
    .sort((a, b) => b.result.edgeScore - a.result.edgeScore);
}
