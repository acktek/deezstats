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
