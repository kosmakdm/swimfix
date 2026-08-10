import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "../fit/decode";
import { applyEdits, EditConflictError, lengthsTouched } from "./apply";
import type { EditOp } from "../analysis/detect";

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
  });

  it("keeps raw messages for re-encoding", () => {
    expect(out.raw).toBe(a.raw);
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
