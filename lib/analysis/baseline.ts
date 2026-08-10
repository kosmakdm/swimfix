import type { LengthData, SwimStroke } from "../fit/types";

export interface RobustStats { median: number; mad: number; n: number }
export interface StrokeStats { strokes: RobustStats; seconds: RobustStats }
export interface Baselines {
  byStroke: Map<SwimStroke, StrokeStats>;
  overall: StrokeStats;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function robustStats(values: number[]): RobustStats {
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const deviations = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return { median: med, mad: median(deviations), n: values.length };
}

export function sigma(s: RobustStats): number {
  return 1.4826 * s.mad;
}

function statsOf(lengths: LengthData[]): StrokeStats {
  return {
    strokes: robustStats(lengths.map((l) => l.totalStrokes ?? 0)),
    seconds: robustStats(lengths.map((l) => l.totalTimerTime)),
  };
}

export function buildBaselines(lengths: LengthData[]): Baselines {
  const active = lengths.filter((l) => l.lengthType === "active");
  const byStroke = new Map<SwimStroke, StrokeStats>();
  const groups = new Map<SwimStroke, LengthData[]>();
  for (const l of active) {
    if (!l.swimStroke) continue;
    const g = groups.get(l.swimStroke) ?? [];
    g.push(l);
    groups.set(l.swimStroke, g);
  }
  for (const [stroke, g] of groups) byStroke.set(stroke, statsOf(g));
  return { byStroke, overall: statsOf(active) };
}

export function statsFor(
  b: Baselines,
  stroke: SwimStroke | undefined,
  minN: number,
): StrokeStats {
  if (stroke) {
    const s = b.byStroke.get(stroke);
    if (s && s.strokes.n >= minN) return s;
  }
  return b.overall;
}
