/** Pure hit-test used by chart hover handlers: the bar under `px`, or the
 *  nearest one if none contains it. Returns null for an empty bar list
 *  instead of throwing — `Array.reduce` with no initial value throws
 *  "Reduce of empty array with no initial value" on an empty array, which
 *  otherwise crashes every mousemove over a chart with zero bars (e.g. an
 *  activity with zero lengths). */
export function pickBar<T extends { x0: number; x1: number }>(bars: T[], px: number): T | null {
  if (bars.length === 0) return null;
  return bars.find((b) => px >= b.x0 && px < b.x1) ??
    bars.reduce((best, b) =>
      Math.abs((b.x0 + b.x1) / 2 - px) < Math.abs((best.x0 + best.x1) / 2 - px) ? b : best);
}
