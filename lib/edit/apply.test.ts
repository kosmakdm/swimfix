import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "../fit/decode";
import { applyEdits, EditConflictError, lengthsTouched } from "./apply";
import type { EditOp } from "../analysis/detect";
import type { SwimActivity } from "../fit/types";

const bytes = new Uint8Array(
  fs.readFileSync(new URL("../../test/fixtures/sample-swim.fit", import.meta.url)),
);
const GOLDEN_OPS: EditOp[] = [
  { type: "merge", lengthIndexes: [6, 7, 8] },
  { type: "merge", lengthIndexes: [18, 19] },
  { type: "merge", lengthIndexes: [20, 21] },
];

describe("applyEdits on the real swim with the golden proposals", () => {
  const a = decodeSwimFit(bytes);
  const out = applyEdits(a, GOLDEN_OPS);

  it("does not mutate the input", () => {
    expect(a.lengths).toHaveLength(43);
    expect(a.session.totalDistance).toBe(1300);
  });

  it("produces 39 lengths with a contiguous messageIndex chain", () => {
    expect(out.lengths).toHaveLength(39);
    out.lengths.forEach((l, i) => expect(l.messageIndex).toBe(i));
  });

  it("builds the merged length correctly", () => {
    const m = out.lengths[6];
    expect(m.totalStrokes).toBe(37);            // 9 + 9 + 19
    expect(m.swimStroke).toBe("freestyle");     // 19 freestyle strokes beat 18 breaststroke
    expect(m.lengthType).toBe("active");
    expect(m.totalTimerTime).toBeCloseTo(96.249, 2);
    expect(m.startTime).toEqual(a.lengths[6].startTime);
    // Garmin Connect plots per-length pace from avgSpeed — a merged length
    // must carry it like every device-written active length does
    expect(m.avgSpeed).toBeCloseTo(50 / 96.249, 3);
  });

  it("recomputes the affected laps", () => {
    expect(out.laps[4]).toMatchObject({
      numLengths: 3, numActiveLengths: 3, totalDistance: 150,
      totalStrokes: 99, swimStroke: "freestyle", firstLengthIndex: 5,
    });
    expect(out.laps[12]).toMatchObject({
      numLengths: 2, numActiveLengths: 2, totalDistance: 100, totalStrokes: 75,
    });
  });

  it("remaps firstLengthIndex for later laps", () => {
    expect(out.laps[5].firstLengthIndex).toBe(8);   // was 10, minus 2 merged away
    expect(out.laps[13].firstLengthIndex).toBe(18); // was 22, minus 4
  });

  it("recomputes the session", () => {
    expect(out.session.totalDistance).toBe(1100);
    expect(out.session.numActiveLengths).toBe(22);
    expect(out.session.totalStrokes).toBe(731);     // strokes conserved by merges
    expect(out.session.totalTimerTime).toBeCloseTo(2695.631, 2); // time untouched
    expect(out.session.numLengths).toBe(23);         // 27 - 4 length messages removed
  });

  it("keeps raw messages for re-encoding", () => {
    expect(out.raw).toBe(a.raw);
  });
});

describe("applyEdits — split op (missed turns)", () => {
  const a = decodeSwimFit(bytes);
  // length 0: freestyle, 28 strokes, 62.687 s, owned by lap 0 (with length 1)
  const out = applyEdits(a, [{ type: "split", lengthIndex: 0, parts: 2 }]);

  it("replaces one length with two contiguous halves", () => {
    expect(out.lengths).toHaveLength(44);
    const [p1, p2] = [out.lengths[0], out.lengths[1]];
    expect(p1.totalStrokes).toBe(14);
    expect(p2.totalStrokes).toBe(14);
    expect(p1.totalTimerTime).toBeCloseTo(62.687 / 2, 3);
    expect(p2.totalTimerTime).toBeCloseTo(62.687 / 2, 3);
    expect(p1.swimStroke).toBe("freestyle");
    expect(p2.swimStroke).toBe("freestyle");
    expect(p1.lengthType).toBe("active");
    expect(p2.lengthType).toBe("active");
    expect(p1.startTime).toEqual(a.lengths[0].startTime);
    expect(p2.startTime.getTime()).toBeCloseTo(
      a.lengths[0].startTime.getTime() + (a.lengths[0].totalElapsedTime / 2) * 1000, -2);
    expect(p1.avgSpeed).toBeCloseTo(50 / (62.687 / 2), 3);
    out.lengths.forEach((l, i) => expect(l.messageIndex).toBe(i));
  });

  it("distributes odd strokes deterministically (first part gets the extra)", () => {
    // length 5: freestyle, 33 strokes
    const odd = applyEdits(a, [{ type: "split", lengthIndex: 5, parts: 2 }]);
    expect(odd.lengths[5].totalStrokes).toBe(17);
    expect(odd.lengths[6].totalStrokes).toBe(16);
  });

  it("recomputes the owning lap and shifts later laps", () => {
    expect(out.laps[0]).toMatchObject({
      numLengths: 3, numActiveLengths: 3, totalDistance: 150, totalStrokes: 62,
    });
    expect(out.laps[1].firstLengthIndex).toBe(3); // was 2
  });

  it("recomputes the session (+50 m)", () => {
    expect(out.session.totalDistance).toBe(1350);
    expect(out.session.numActiveLengths).toBe(27);
    expect(out.session.totalStrokes).toBe(731);   // strokes conserved
    expect(out.session.numLengths).toBe(28);      // was 27, one length added
  });

  it("rejects invalid splits", () => {
    expect(() => applyEdits(a, [{ type: "split", lengthIndex: 0, parts: 1 }]))
      .toThrow(EditConflictError);
    expect(() => applyEdits(a, [{ type: "split", lengthIndex: 2, parts: 2 }]))
      .toThrow(EditConflictError); // length 2 is idle
    expect(() => applyEdits(a, [
      { type: "split", lengthIndex: 6, parts: 2 },
      { type: "merge", lengthIndexes: [6, 7] },
    ])).toThrow(EditConflictError); // overlap
  });
});

describe("applyEdits — other ops and validation", () => {
  const a = decodeSwimFit(bytes);

  it("toRest converts an active length to idle and drops stroke data", () => {
    const out = applyEdits(a, [{ type: "toRest", lengthIndexes: [6] }]);
    expect(out.lengths[6].lengthType).toBe("idle");
    expect(out.lengths[6].totalStrokes).toBeUndefined();
    expect(out.lengths).toHaveLength(43);
    expect(out.session.totalDistance).toBe(1250);
    expect(out.laps[4].totalDistance).toBe(200);
  });

  it("relabel changes only the stroke", () => {
    const out = applyEdits(a, [{ type: "relabel", lengthIndex: 6, stroke: "freestyle" }]);
    expect(out.lengths[6].swimStroke).toBe("freestyle");
    expect(out.lengths[6].totalStrokes).toBe(9);
    expect(out.session.totalDistance).toBe(1300);
  });

  it("rejects overlapping ops", () => {
    expect(() => applyEdits(a, [
      { type: "merge", lengthIndexes: [6, 7] },
      { type: "toRest", lengthIndexes: [7] },
    ])).toThrow(EditConflictError);
  });

  it("rejects non-consecutive merges", () => {
    expect(() => applyEdits(a, [{ type: "merge", lengthIndexes: [6, 8] }]))
      .toThrow(EditConflictError);
  });

  it("rejects merging across laps", () => {
    // length 9 is lap 4's last, length 10 is idle in lap 5's range
    expect(() => applyEdits(a, [{ type: "merge", lengthIndexes: [9, 10] }]))
      .toThrow(EditConflictError);
  });

  it("lengthsTouched reports indexes for the UI", () => {
    expect(lengthsTouched({ type: "merge", lengthIndexes: [6, 7, 8] })).toEqual([6, 7, 8]);
    expect(lengthsTouched({ type: "relabel", lengthIndex: 3, stroke: "drill" })).toEqual([3]);
  });
});

describe("applyEdits — yard-pool distance rounding", () => {
  const a = decodeSwimFit(bytes);
  // Shallow-modified activity: a non-metric pool length (yards-in-meters,
  // 22.86) whose products with integer length counts are classic binary
  // floating-point noise generators — e.g. 22 × 22.86 = 502.91999999999996
  // in raw JS arithmetic, which is exactly the active-length count the
  // golden ops leave behind (verified: 22 * 22.86 !== 502.92 without
  // rounding).
  const yardActivity: SwimActivity = { ...a, session: { ...a.session, poolLength: 22.86 } };

  it("keeps lap and session totalDistance at exact 2-decimal precision", () => {
    const out = applyEdits(yardActivity, GOLDEN_OPS);
    expect(out.session.numActiveLengths).toBe(22); // the exact float-noise case: 22 × 22.86

    // Without rounding this would be 502.91999999999996, not 502.92.
    expect(out.session.totalDistance).toBe(502.92);

    // Number.isInteger(v * 100) is true only for values with no more than
    // 2 decimal digits of precision (modulo float representation, which
    // Math.round(v*100)/100 guarantees here).
    expect(Number.isInteger(out.session.totalDistance! * 100)).toBe(true);
    for (const lap of out.laps) {
      if (lap.totalDistance === undefined) continue;
      expect(Number.isInteger(lap.totalDistance * 100)).toBe(true);
    }

    // Cross-check against the manually rounded expectation the FIT round
    // trip (round(v*100)/100) would itself produce.
    const expectedSessionDistance = Math.round(out.session.numActiveLengths! * 22.86 * 100) / 100;
    expect(out.session.totalDistance).toBeCloseTo(expectedSessionDistance, 10);

    const lap4Actives = out.laps[4].numActiveLengths!;
    const expectedLap4Distance = Math.round(lap4Actives * 22.86 * 100) / 100;
    expect(out.laps[4].totalDistance).toBeCloseTo(expectedLap4Distance, 10);
  });
});

describe("applyEdits — numLengths passthrough", () => {
  const a = decodeSwimFit(bytes);

  it("leaves session.numLengths untouched when the source doesn't carry a numeric field", () => {
    const noNumLengths: SwimActivity = {
      ...a,
      session: { ...a.session, numLengths: undefined },
    };
    const out = applyEdits(noNumLengths, [{ type: "toRest", lengthIndexes: [6] }]);
    expect(out.session.numLengths).toBeUndefined();
  });
});
