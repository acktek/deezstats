/**
 * Edge Detection Algorithm for Live Betting
 *
 * The core thesis: Sportsbooks anchor live lines to historical data.
 * For players with limited sample sizes (rookies, role players, early-season),
 * their adjustments lag behind reality.
 *
 * EDGE_SCORE = (ADJUSTED_PACE_RATIO × DATA_SCARCITY × GAME_TIMING) - VARIANCE_PENALTY
 *
 * Where:
 * - PACE_RATIO = (current_stats / player_progress%) / pregame_line
 * - ADJUSTED_PACE_RATIO = PACE_RATIO / STAT_DAMPENING (see below)
 * - player_progress% = minutes_played / expected_minutes (if available)
 *                    = game_elapsed% (fallback)
 * - DATA_SCARCITY = 1 + (1 / sqrt(games_played + 1))
 * - GAME_TIMING = 1 - (game_elapsed% × 0.5)
 * - VARIANCE_PENALTY = historical_stddev / pregame_line
 *
 * STAT_DAMPENING accounts for low-volume stats (steals, blocks) being noisy:
 * - Early game: dampening is high (don't trust 1 steal = pace for 5)
 * - Late game: dampening fades as we have more data
 * - High-volume stats (points) have minimal dampening
 *
 * Using minutes played instead of game elapsed prevents false positives when:
 * - Player is sitting due to foul trouble
 * - Blowout game (starters benched early)
 * - Player has already played more than their usual minutes
 */

/**
 * Stat-type dampening factors for early-game noise reduction.
 * Higher values = more dampening = less trust in early projections.
 *
 * Rationale:
 * - Points accumulate consistently, 8 pts in Q1 is meaningful signal
 * - Steals/blocks are opportunistic, 1 early steal ≠ pace for 4
 * - 3-pointers are streaky, can go cold after hot start
 */
const STAT_DAMPENING: Record<string, number> = {
  // NBA - lower volume stats need more dampening
  points: 1.0,          // reliable accumulator
  rebounds: 1.15,       // somewhat consistent
  assists: 1.25,        // playmaking can be streaky
  three_pointers: 1.6,  // very streaky (hot/cold)
  steals: 2.0,          // highly opportunistic, noisy
  blocks: 2.0,          // highly opportunistic, noisy

  // NFL
  passing_yards: 1.0,   // accumulates steadily
  rushing_yards: 1.2,   // can be game-script dependent
  receiving_yards: 1.3, // target-dependent
  receptions: 1.25,     // target-dependent
  touchdowns: 2.0,      // rare events, very noisy
};

export interface EdgeInput {
  currentValue: number;
  gameElapsedPercent: number;
  pregameLine: number;
  gamesPlayed: number;
  historicalStddev?: number;
  isRookie?: boolean;
  // Minutes-based pace (more accurate than game elapsed)
  minutesPlayed?: number;      // Current minutes played (e.g., 24.5)
  expectedMinutes?: number;    // Season avg minutes per game (e.g., 32)
  // Stat type for dampening calculation
  statType?: string;           // e.g., "points", "steals", "blocks"
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
  };
}

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
  } = input;

  // Avoid division by zero
  const line = Math.max(pregameLine, 0.1);

  // Calculate player progress - prefer minutes-based if available
  let playerProgress: number;
  if (minutesPlayed !== undefined && expectedMinutes && expectedMinutes > 0) {
    // Minutes-based progress: how much of their expected minutes they've played
    playerProgress = Math.max(minutesPlayed / expectedMinutes, 0.01);
  } else {
    // Fallback to game elapsed percentage
    playerProgress = Math.max(gameElapsedPercent, 1) / 100;
  }

  // Calculate projected pace (what they're on pace for)
  const pace = currentValue / playerProgress;
  const projectedFinal = pace;

  // PACE_RATIO: How much ahead of the line they are, normalized
  const paceRatio = pace / line;

  // STAT_DAMPENING: Reduce noise from low-volume stats early in game
  // - Early game: full dampening applied (don't trust 1 steal = pace for 5)
  // - Late game: dampening fades as we have more real data
  const baseDampening = statType ? (STAT_DAMPENING[statType] ?? 1.0) : 1.0;
  const gameProgress = gameElapsedPercent / 100;
  // Dampening scales from full effect (early) to minimal effect (late game)
  // At 0% game: effectiveDampening = baseDampening
  // At 100% game: effectiveDampening = 1.0 (no dampening)
  const statDampening = 1 + (baseDampening - 1) * (1 - gameProgress);
  const adjustedPaceRatio = paceRatio / statDampening;

  // DATA_SCARCITY: Higher multiplier for fewer games played
  // Rookies get a boost here
  const baseScarcity = 1 + 1 / Math.sqrt(gamesPlayed + 1);
  const dataScarcity = isRookie ? baseScarcity * 1.2 : baseScarcity;

  // GAME_TIMING: Early game opportunities are more valuable
  // Decays from 1.0 to 0.5 as game progresses
  const gameTiming = 1 - (gameElapsedPercent / 100) * 0.5;

  // VARIANCE_PENALTY: Reduce score for historically inconsistent players
  const variancePenalty = historicalStddev > 0 ? historicalStddev / line : 0;

  // Calculate final edge score using adjusted pace ratio
  const rawScore = adjustedPaceRatio * dataScarcity * gameTiming - variancePenalty;

  // Clamp to reasonable range
  const edgeScore = Math.max(0, Math.min(rawScore, 10));

  // Determine signal level
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
