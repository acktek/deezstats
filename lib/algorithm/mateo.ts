/**
 * Mateo Algorithm for Live Betting
 *
 * A clean pace-based approach:
 *
 * % Target = Live_Stat / Live_Prop
 * % Pace = % Target / % Game_Remaining
 *
 * Interpretation:
 * - % Pace = 1 → Player is exactly on target
 * - % Pace > 1 → Player is ahead of pace
 * - % Pace < 1 → Player is behind pace
 */

export interface MateoInput {
  currentValue: number;      // Live stat value
  pregameLine: number;       // Betting line (prop)
  gameElapsedPercent: number; // How much of the game has passed (0-100)
}

export interface MateoResult {
  pacePercent: number;       // The % Pace value
  targetPercent: number;     // % of line achieved so far
  signal: "behind" | "on_target" | "ahead" | "way_ahead";
}

export function calculateMateoScore(input: MateoInput): MateoResult {
  const { currentValue, pregameLine, gameElapsedPercent } = input;

  // Avoid division by zero
  const line = Math.max(pregameLine, 0.1);
  const gameRemaining = Math.max((100 - gameElapsedPercent) / 100, 0.01);

  // % Target = Live_Stat / Live_Prop
  const targetPercent = currentValue / line;

  // % Pace = % Target / % Game_Remaining
  const pacePercent = targetPercent / gameRemaining;

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
