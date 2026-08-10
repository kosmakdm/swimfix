import type { SwimActivity } from "../fit/types";

export function fmtDur(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function fmtPace(secPer100m: number): string {
  return `${fmtDur(secPer100m)} /100m`;
}

export function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour12: false });
}

export function activeSeconds(a: SwimActivity): number {
  return a.lengths
    .filter((l) => l.lengthType === "active")
    .reduce((s, l) => s + l.totalTimerTime, 0);
}

export function avgPaceSecPer100(a: SwimActivity): number | null {
  const dist = a.session.totalDistance ?? 0;
  if (dist <= 0) return null;
  return (activeSeconds(a) / dist) * 100;
}
