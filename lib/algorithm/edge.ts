/**
 * Edge Detection Algorithm for Live Betting
 *
 * The core thesis: Sportsbooks anchor live lines to historical data.
 * For players with limited sample sizes (rookies, role players, early-season),
 * their adjustments lag behind reality.
 *
 * EDGE_SCORE = (PACE_RATIO × DATA_SCARCITY × GAME_TIMING) - VARIANCE_PENALTY
 *
 * Where:
 * - PACE_RATIO = (current_stats / game_elapsed%) / pregame_line
 * - DATA_SCARCITY = 1 + (1 / sqrt(games_played + 1))
 * - GAME_TIMING = 1 - (game_elapsed% × 0.5)
 * - VARIANCE_PENALTY = historical_stddev / pregame_line
 */

export interface EdgeInput {
  currentValue: number;
  gameElapsedPercent: number;
  pregameLine: number;
  gamesPlayed: number;
  historicalStddev?: number;
  isRookie?: boolean;
}

export interface EdgeResult {
  edgeScore: number;
  pace: number;
  projectedFinal: number;
  signal: "none" | "monitor" | "good" | "strong";
  components: {
    paceRatio: number;
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
  } = input;

  // Avoid division by zero
  const elapsedPct = Math.max(gameElapsedPercent, 1) / 100;
  const line = Math.max(pregameLine, 0.1);

  // Calculate projected pace (what they're on pace for)
  const pace = currentValue / elapsedPct;
  const projectedFinal = pace;

  // PACE_RATIO: How much ahead of the line they are, normalized
  const paceRatio = pace / line;

  // DATA_SCARCITY: Higher multiplier for fewer games played
  // Rookies get a boost here
  const baseScarcity = 1 + 1 / Math.sqrt(gamesPlayed + 1);
  const dataScarcity = isRookie ? baseScarcity * 1.2 : baseScarcity;

  // GAME_TIMING: Early game opportunities are more valuable
  // Decays from 1.0 to 0.5 as game progresses
  const gameTiming = 1 - elapsedPct * 0.5;

  // VARIANCE_PENALTY: Reduce score for historically inconsistent players
  const variancePenalty = historicalStddev > 0 ? historicalStddev / line : 0;

  // Calculate final edge score
  const rawScore = paceRatio * dataScarcity * gameTiming - variancePenalty;

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
