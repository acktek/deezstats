/**
 * Mateo Algorithm for Live Betting
 *
 * A clean pace-based approach using player minutes for accuracy:
 *
 * % Target = Live_Stat / Live_Prop
 * % Pace = % Target / % Player_Progress
 *
 * Where % Player_Progress = minutes_played / expected_minutes (preferred)
 *                         = game_elapsed% (fallback)
 *
 * Using minutes prevents false positives when:
 * - Player is benched in blowouts
 * - Player in foul trouble
 * - Player has exceeded their usual minutes
 *
 * Interpretation:
 * - % Pace = 1 → Player is exactly on target
 * - % Pace > 1 → Player is ahead of pace
 * - % Pace < 1 → Player is behind pace
 */

export interface MateoInput {
  currentValue: number;       // Live stat value
  pregameLine: number;        // Betting line (prop)
  gameElapsedPercent: number; // How much of the game has passed (0-100)
  // Minutes-based pace (more accurate than game elapsed)
  minutesPlayed?: number;     // Current minutes played (e.g., 24.5)
  expectedMinutes?: number;   // Season avg minutes per game (e.g., 32)
}

export interface MateoResult {
  pacePercent: number;       // The % Pace value
  targetPercent: number;     // % of line achieved so far
  signal: "behind" | "on_target" | "ahead" | "way_ahead";
}

export function calculateMateoScore(input: MateoInput): MateoResult {
  const { currentValue, pregameLine, gameElapsedPercent, minutesPlayed, expectedMinutes } = input;

  // Avoid division by zero
  const line = Math.max(pregameLine, 0.1);

  // Calculate player progress - prefer minutes-based if available
  let playerProgress: number;
  if (minutesPlayed !== undefined && expectedMinutes && expectedMinutes > 0) {
    // Minutes-based progress: how much of their expected minutes they've played
    playerProgress = Math.max(minutesPlayed / expectedMinutes, 0.01);
  } else {
    // Fallback to game elapsed percentage
    playerProgress = Math.max(gameElapsedPercent / 100, 0.01);
  }

  // % Target = Live_Stat / Live_Prop
  const targetPercent = currentValue / line;

  // % Pace = % Target / % Player_Progress
  const pacePercent = targetPercent / playerProgress;

  // Determine signal
  const signal = getMateoSignal(pacePercent);

  return {
    pacePercent,
    targetPercent,
    signal,
  };
}

function getMateoSignal(pacePercent: number): MateoResult["signal"] {
  if (pacePercent < 0.9) return "behind";
  if (pacePercent <= 1.1) return "on_target";
  if (pacePercent <= 1.5) return "ahead";
  return "way_ahead";
}

/**
 * Signal Thresholds:
 * < 0.9  - Behind pace (red)
 * 0.9-1.1 - On target (neutral)
 * 1.1-1.5 - Ahead of pace (green)
 * > 1.5  - Way ahead (gold)
 */
export const MATEO_THRESHOLDS = {
  BEHIND: 0.9,
  ON_TARGET: 1.1,
  AHEAD: 1.5,
} as const;
