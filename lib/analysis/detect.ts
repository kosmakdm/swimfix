import type { LengthData, SwimActivity, SwimStroke } from "../fit/types";
import { buildBaselines, sigma, statsFor, type Baselines } from "./baseline";
import { DEFAULT_CONFIG, type DetectConfig } from "./config";

export type Confidence = "high" | "medium" | "low";

export type EditOp =
  | { type: "merge"; lengthIndexes: number[] }
  | { type: "toRest"; lengthIndexes: number[] }
  | { type: "relabel"; lengthIndex: number; stroke: SwimStroke };

export interface Proposal {
  id: string;
  op: EditOp;
  confidence: Confidence;
  reason: string;
}

export function opId(op: EditOp): string {
  if (op.type === "relabel") return `relabel:${op.lengthIndex}`;
  return `${op.type}:${op.lengthIndexes.join("-")}`;
}

/** Map each length index to the index of the lap that owns it (or -1). */
function lapOwnership(a: SwimActivity): number[] {
  const owner = new Array<number>(a.lengths.length).fill(-1);
  a.laps.forEach((lap, li) => {
    const first = lap.firstLengthIndex ?? -1;
    const n = lap.numLengths ?? 0;
    if (first < 0 || n <= 0) return;
    for (let i = first; i < first + n && i < owner.length; i++) owner[i] = li;
  });
  return owner;
}

function dominantStroke(members: LengthData[]): SwimStroke | undefined {
  const sums = new Map<SwimStroke, number>();
  for (const m of members) {
    if (!m.swimStroke) continue;
    sums.set(m.swimStroke, (sums.get(m.swimStroke) ?? 0) + (m.totalStrokes ?? 0));
  }
  let best: SwimStroke | undefined;
  let bestSum = -1;
  for (const [s, sum] of sums) if (sum > bestSum) { best = s; bestSum = sum; }
  return best;
}

interface Fit { fits: boolean; tight: boolean }

function candidateFit(
  members: LengthData[], b: Baselines, cfg: DetectConfig,
): Fit {
  const stats = statsFor(b, dominantStroke(members), cfg.minGroupSamples);
  const strokes = members.reduce((s, m) => s + (m.totalStrokes ?? 0), 0);
  const seconds = members.reduce((s, m) => s + m.totalTimerTime, 0);
  const within = (v: number, med: number, sd: number, k: number) =>
    Math.abs(v - med) <= k * sd;
  const sSd = sigma(stats.strokes);
  const tSd = sigma(stats.seconds);
  const fits =
    within(strokes, stats.strokes.median, sSd, cfg.mergeBandSigmas) &&
    within(seconds, stats.seconds.median, tSd, cfg.mergeBandSigmas);
  const tight =
    within(strokes, stats.strokes.median, sSd, cfg.highConfidenceSigmas) &&
    within(seconds, stats.seconds.median, tSd, cfg.highConfidenceSigmas);
  return { fits, tight };
}

function mergeReason(members: LengthData[], b: Baselines, cfg: DetectConfig): string {
  const stroke = dominantStroke(members);
  const stats = statsFor(b, stroke, cfg.minGroupSamples);
  const parts = members.map((m) => m.totalStrokes ?? 0).join("+");
  const secs = Math.round(members.reduce((s, m) => s + m.totalTimerTime, 0));
  const first = members[0].messageIndex + 1;
  const last = members[members.length - 1].messageIndex + 1;
  return `Lengths ${first}–${last} look like one interrupted length: ` +
    `${parts} strokes in ${secs}s — your typical ${stroke ?? "swim"} length is ` +
    `${Math.round(stats.strokes.median)} strokes in ${Math.round(stats.seconds.median)}s.`;
}

export function detectProposals(
  a: SwimActivity,
  cfg: DetectConfig = DEFAULT_CONFIG,
): Proposal[] {
  const b = buildBaselines(a.lengths);
  const owner = lapOwnership(a);
  const proposals: Proposal[] = [];
  const consumed = new Set<number>();

  const isFragment = (l: LengthData): boolean => {
    if (l.lengthType !== "active") return false;
    const stats = statsFor(b, l.swimStroke, cfg.minGroupSamples);
    return (l.totalStrokes ?? 0) < cfg.fragmentStrokeRatio * stats.strokes.median;
  };

  const active = (i: number) => a.lengths[i]?.lengthType === "active";

  // --- fragment runs -------------------------------------------------------
  const fragments = a.lengths.map(isFragment);
  let i = 0;
  while (i < a.lengths.length) {
    if (!fragments[i]) { i++; continue; }
    let j = i;
    while (j + 1 < a.lengths.length && fragments[j + 1] && owner[j + 1] === owner[i]) j++;
    const run = a.lengths.slice(i, j + 1);

    const tryCandidate = (idxs: number[]): Proposal | null => {
      if (idxs.some((k) => consumed.has(k))) return null;
      const members = idxs.map((k) => a.lengths[k]);
      const { fits, tight } = candidateFit(members, b, cfg);
      if (!fits) return null;
      const op: EditOp = { type: "merge", lengthIndexes: idxs };
      return {
        id: opId(op), op,
        confidence: tight ? "high" : "medium",
        reason: mergeReason(members, b, cfg),
      };
    };

    const runIdxs = run.map((l) => a.lengths.indexOf(l));
    const right = j + 1 < a.lengths.length && owner[j + 1] === owner[i] &&
      active(j + 1) && !fragments[j + 1] ? [...runIdxs, j + 1] : null;
    const left = i - 1 >= 0 && owner[i - 1] === owner[i] &&
      active(i - 1) && !fragments[i - 1] ? [i - 1, ...runIdxs] : null;

    const prop =
      tryCandidate(runIdxs) ??
      (right ? tryCandidate(right) : null) ??
      (left ? tryCandidate(left) : null);

    if (prop) {
      proposals.push(prop);
      for (const k of prop.op.type === "merge" ? prop.op.lengthIndexes : []) consumed.add(k);
    } else {
      const stats = statsFor(b, dominantStroke(run), cfg.minGroupSamples);
      const strokes = run.reduce((s, m) => s + (m.totalStrokes ?? 0), 0);
      const op: EditOp = { type: "toRest", lengthIndexes: runIdxs };
      proposals.push({
        id: opId(op), op,
        confidence: strokes <= cfg.toRestStrokeRatio * stats.strokes.median ? "medium" : "low",
        reason: `Length${runIdxs.length > 1 ? "s" : ""} ${runIdxs.map((k) => k + 1).join(", ")} ` +
          `(${strokes} strokes) can't be combined into a plausible length — ` +
          `probably not real swimming. Converting to rest removes ` +
          `${runIdxs.length * 1} counted length${runIdxs.length > 1 ? "s" : ""}.`,
      });
      runIdxs.forEach((k) => consumed.add(k));
    }
    i = j + 1;
  }

  // --- relabel pass --------------------------------------------------------
  a.laps.forEach((lap) => {
    const first = lap.firstLengthIndex ?? -1;
    const n = lap.numLengths ?? 0;
    if (first < 0 || n <= 0) return;
    const idxs: number[] = [];
    for (let k = first; k < first + n && k < a.lengths.length; k++) {
      if (active(k) && !fragments[k] && !consumed.has(k)) idxs.push(k);
    }
    if (idxs.length < cfg.minLapActives) return;
    const counts = new Map<SwimStroke, number>();
    for (const k of idxs) {
      const s = a.lengths[k].swimStroke;
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let majority: SwimStroke | undefined;
    for (const [s, c] of counts) {
      if (c / idxs.length >= cfg.relabelMajority) majority = s;
    }
    if (!majority) return;
    const majStats = statsFor(b, majority, cfg.minGroupSamples);
    for (const k of idxs) {
      const l = a.lengths[k];
      if (!l.swimStroke || l.swimStroke === majority) continue;
      const dev = Math.abs((l.totalStrokes ?? 0) - majStats.strokes.median);
      if (dev > cfg.highConfidenceSigmas * sigma(majStats.strokes)) continue;
      const own = b.byStroke.get(l.swimStroke);
      const hasOwnBaseline = !!own && own.strokes.n >= cfg.minGroupSamples;
      const op: EditOp = { type: "relabel", lengthIndex: k, stroke: majority };
      proposals.push({
        id: opId(op), op,
        confidence: hasOwnBaseline ? "medium" : "low",
        reason: `Length ${k + 1} is labeled ${l.swimStroke} but its ` +
          `${l.totalStrokes ?? 0} strokes match your ${majority} lengths ` +
          `(typically ${Math.round(majStats.strokes.median)}); the rest of this ` +
          `set is ${majority}.`,
      });
    }
  });

  return proposals;
}
