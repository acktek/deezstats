import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getEdgeClass(score: number): string {
  if (score < 1.5) return "edge-none";
  if (score < 2.0) return "edge-monitor";
  if (score < 3.0) return "edge-good";
  return "edge-strong";
}

export function getEdgeLabel(score: number): string {
  if (score < 1.5) return "No Edge";
  if (score < 2.0) return "Monitor";
  if (score < 3.0) return "Good";
  return "Strong";
}

/**
 * Get today's date in UTC as YYYY-MM-DD string.
 * Use this for API calls to ensure consistent behavior across environments.
 */
export function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get a range of dates (yesterday, today, tomorrow) in UTC.
 * This handles timezone differences between the server and game schedules.
 * Games scheduled in US timezones may appear on different UTC dates.
 */
export function getDateRangeUTC(): string[] {
  const now = new Date();
  const dates: string[] = [];

  for (let offset = -1; offset <= 1; offset++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Get the current NBA/NFL season year.
 * Seasons span two years (e.g., 2024-25), this returns the start year.
 * Uses UTC month to ensure consistency.
 */
export function getCurrentSeasonUTC(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // NBA/NFL seasons start in fall (September/October)
  return month >= 9 ? year : year - 1;
}

/**
 * Get NBA player headshot URL from NBA.com CDN.
 * Uses the BallDontLie player ID which maps to NBA.com player IDs.
 */
export function getNBAHeadshotUrl(playerId: string | number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`;
}
