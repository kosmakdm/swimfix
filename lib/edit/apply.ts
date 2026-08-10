import type { LapData, LengthData, SwimActivity, SwimStroke } from "../fit/types";
import type { EditOp } from "../analysis/detect";

export class EditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditConflictError";
  }
}

/** Round a computed distance to hundredths, matching the precision the FIT
 *  round trip settles on (round(v*100)/100). Raw float products of a pool
 *  length and a length count (e.g. 22 × 22.86 m) otherwise carry binary
 *  floating-point noise (502.91999999999996) that a strict-equality re-check
 *  against the decoded, rounded value would spuriously reject. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function lengthsTouched(op: EditOp): number[] {
  return op.type === "relabel" ? [op.lengthIndex] : [...op.lengthIndexes];
}

function lapOwnerOf(laps: LapData[], lengthIndex: number): number {
  return laps.findIndex((lap) => {
    const first = lap.firstLengthIndex ?? -1;
    const n = lap.numLengths ?? 0;
    return first >= 0 && n > 0 && lengthIndex >= first && lengthIndex < first + n;
  });
}

function validate(a: SwimActivity, ops: EditOp[]): void {
  const seen = new Set<number>();
  for (const op of ops) {
    for (const idx of lengthsTouched(op)) {
      if (idx < 0 || idx >= a.lengths.length) {
        throw new EditConflictError(`Length ${idx + 1} does not exist.`);
      }
      if (seen.has(idx)) {
        throw new EditConflictError(
          `Length ${idx + 1} is affected by two edits — reject one of them first.`,
        );
      }
      seen.add(idx);
    }
    if (op.type === "merge") {
      const idxs = op.lengthIndexes;
      if (idxs.length < 2) throw new EditConflictError("A merge needs at least two lengths.");
      for (let k = 1; k < idxs.length; k++) {
        if (idxs[k] !== idxs[k - 1] + 1) {
          throw new EditConflictError("Merged lengths must be consecutive.");
        }
      }
      if (idxs.some((i) => a.lengths[i].lengthType !== "active")) {
        throw new EditConflictError("Only active lengths can be merged.");
      }
      const owners = new Set(idxs.map((i) => lapOwnerOf(a.laps, i)));
      if (owners.size !== 1) {
        throw new EditConflictError("Merged lengths must belong to the same lap.");
      }
    }
  }
}

function mergedLength(members: LengthData[], poolLength: number): LengthData {
  const strokes = members.reduce((s, m) => s + (m.totalStrokes ?? 0), 0);
  const timer = members.reduce((s, m) => s + m.totalTimerTime, 0);
  const elapsed = members.reduce((s, m) => s + m.totalElapsedTime, 0);
  const calDefined = members.filter((m) => m.totalCalories !== undefined);
  const bySummedStrokes = new Map<SwimStroke, number>();
  for (const m of members) {
    if (!m.swimStroke) continue;
    bySummedStrokes.set(
      m.swimStroke,
      (bySummedStrokes.get(m.swimStroke) ?? 0) + (m.totalStrokes ?? 0),
    );
  }
  let stroke: SwimStroke | undefined;
  let best = -1;
  for (const [s, sum] of bySummedStrokes) if (sum > best) { stroke = s; best = sum; }
  // Spread members[0] (a device-written length) so the merged object keeps the
  // device's exact field set AND key order. The FIT SDK Encoder reuses its
  // cached field definition when a message's field-name set matches the
  // previous one of that type, but writes values in OBJECT KEY ORDER — a
  // same-set/different-order object silently scrambles every field on decode.
  return {
    ...members[0],
    totalElapsedTime: elapsed,
    totalTimerTime: timer,
    lengthType: "active",
    totalStrokes: strokes,
    avgSpeed: timer > 0 ? Math.round((poolLength / timer) * 1000) / 1000 : undefined,
    avgSwimmingCadence: timer > 0 ? Math.round(strokes / (timer / 60)) : undefined,
    swimStroke: stroke,
    totalCalories: calDefined.length
      ? calDefined.reduce((s, m) => s + (m.totalCalories ?? 0), 0)
      : undefined,
  };
}

export function applyEdits(a: SwimActivity, ops: EditOp[]): SwimActivity {
  validate(a, ops);

  const mergeStart = new Map<number, number[]>(); // first index -> all member indexes
  const swallowed = new Set<number>();            // non-first merge members
  const toRest = new Set<number>();
  const relabel = new Map<number, SwimStroke>();
  for (const op of ops) {
    if (op.type === "merge") {
      mergeStart.set(op.lengthIndexes[0], op.lengthIndexes);
      op.lengthIndexes.slice(1).forEach((i) => swallowed.add(i));
    } else if (op.type === "toRest") {
      op.lengthIndexes.forEach((i) => toRest.add(i));
    } else {
      relabel.set(op.lengthIndex, op.stroke);
    }
  }

  const newLengths: LengthData[] = [];
  const oldToNew = new Array<number>(a.lengths.length).fill(-1);
  a.lengths.forEach((l, oldIdx) => {
    if (swallowed.has(oldIdx)) {
      // maps to the merged length created at the merge's first index
      return;
    }
    let next: LengthData;
    const members = mergeStart.get(oldIdx);
    if (members) {
      next = mergedLength(members.map((i) => a.lengths[i]), a.session.poolLength);
    } else if (toRest.has(oldIdx)) {
      next = { ...l, lengthType: "idle" };
      delete next.totalStrokes;
      delete next.avgSwimmingCadence;
      delete next.swimStroke;
    } else if (relabel.has(oldIdx)) {
      next = { ...l, swimStroke: relabel.get(oldIdx) };
    } else {
      next = { ...l };
    }
    next.messageIndex = newLengths.length;
    oldToNew[oldIdx] = newLengths.length;
    newLengths.push(next);
  });
  // point swallowed members at their merged length's new index
  for (const [first, members] of mergeStart) {
    for (const m of members) oldToNew[m] = oldToNew[first];
  }

  const poolLength = a.session.poolLength;

  const newLaps: LapData[] = a.laps.map((lap) => {
    const first = lap.firstLengthIndex ?? -1;
    const n = lap.numLengths ?? 0;
    if (first < 0) return { ...lap };
    const newIdxs = n > 0
      ? [...new Set(
          Array.from({ length: n }, (_, k) => oldToNew[first + k]).filter((i) => i >= 0),
        )].sort((x, y) => x - y)
      : [];
    const owned = newIdxs.map((i) => newLengths[i]);
    const actives = owned.filter((l) => l.lengthType === "active");
    const strokes = actives.reduce((s, l) => s + (l.totalStrokes ?? 0), 0);
    const distance = round2(actives.length * poolLength);
    const out: LapData = {
      ...lap,
      firstLengthIndex: newIdxs[0] ?? oldToNew[first] ?? first,
      numLengths: newIdxs.length,
      numActiveLengths: actives.length,
      totalDistance: distance,
      totalStrokes: strokes,
      totalCycles: strokes,
      avgStrokeDistance: strokes > 0 ? distance / strokes : 0,
      enhancedAvgSpeed: lap.totalTimerTime > 0 ? distance / lap.totalTimerTime : 0,
    };
    const strokeSet = new Set(actives.map((l) => l.swimStroke).filter(Boolean));
    if (strokeSet.size === 1) out.swimStroke = [...strokeSet][0];
    else if (strokeSet.size > 1) out.swimStroke = "mixed";
    else delete out.swimStroke;
    return out;
  });

  const allActives = newLengths.filter((l) => l.lengthType === "active");
  const totalStrokes = allActives.reduce((s, l) => s + (l.totalStrokes ?? 0), 0);
  const totalDistance = round2(allActives.length * poolLength);
  const removedLengths = a.lengths.length - newLengths.length;
  const prevNumLengths = a.session.numLengths;
  const session = {
    ...a.session,
    totalDistance,
    numActiveLengths: allActives.length,
    totalStrokes,
    totalCycles: totalStrokes,
    avgStrokeDistance: totalStrokes > 0 ? totalDistance / totalStrokes : 0,
    enhancedAvgSpeed: a.session.totalTimerTime > 0
      ? totalDistance / a.session.totalTimerTime : 0,
    ...(typeof prevNumLengths === "number"
      ? { numLengths: prevNumLengths - removedLengths }
      : {}),
  };

  return { session, laps: newLaps, lengths: newLengths, hr: a.hr, raw: a.raw };
}
