import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "./decode";
import { encodeSwimFit, validateExport } from "./encode";
import { applyEdits } from "../edit/apply";
import type { SwimActivity } from "./types";

const bytes = new Uint8Array(
  fs.readFileSync(new URL("../../test/fixtures/sample-swim.fit", import.meta.url)),
);

describe("encodeSwimFit round trip (no edits)", () => {
  const a = decodeSwimFit(bytes);
  const encoded = encodeSwimFit(a);
  const back = decodeSwimFit(encoded);

  it("preserves structure and totals", () => {
    expect(back.lengths).toHaveLength(43);
    expect(back.laps).toHaveLength(32);
    expect(back.hr).toHaveLength(2697);
    expect(back.session.totalDistance).toBe(1300);
    expect(back.session.poolLength).toBe(50);
  });

  it("preserves per-length data", () => {
    expect(back.lengths[6].totalStrokes).toBe(9);
    expect(back.lengths[6].swimStroke).toBe("breaststroke");
    expect(back.lengths[2].lengthType).toBe("idle");
    expect(back.lengths[6].totalTimerTime).toBeCloseTo(24.937, 2);
  });

  it("passes validateExport", () => {
    expect(validateExport(encoded, a)).toEqual({ ok: true, problems: [] });
  });
});

describe("encodeSwimFit with edits", () => {
  const a = decodeSwimFit(bytes);
  const edited = applyEdits(a, [
    { type: "merge", lengthIndexes: [6, 7, 8] },
    { type: "merge", lengthIndexes: [18, 19] },
    { type: "merge", lengthIndexes: [20, 21] },
  ]);
  const encoded = encodeSwimFit(edited);
  const back = decodeSwimFit(encoded);

  it("the corrected file decodes to the corrected numbers", () => {
    expect(back.lengths).toHaveLength(39);
    expect(back.session.totalDistance).toBe(1100);
    expect(back.session.numActiveLengths).toBe(22);
    expect(back.laps[5].firstLengthIndex).toBe(8);
    back.lengths.forEach((l, i) => expect(l.messageIndex).toBe(i));
  });

  it("every active length in the corrected file carries avgSpeed (GC pace chart)", () => {
    const actives = back.lengths.filter((l) => l.lengthType === "active");
    expect(actives.length).toBeGreaterThan(0);
    for (const l of actives) {
      expect(l.avgSpeed).toBeGreaterThan(0);
    }
  });

  it("merged lengths round-trip unscrambled (encoder definition-reuse hazard)", () => {
    // If the merged object's key order diverges from the device definition,
    // the SDK encoder writes values into the wrong fields; assert exact values.
    const m = back.lengths[6];
    expect(m.totalStrokes).toBe(37);
    expect(m.avgSpeed).toBeCloseTo(50 / 96.249, 3);
    expect(m.totalTimerTime).toBeCloseTo(96.249, 2);
    expect(m.swimStroke).toBe("freestyle");
    expect(m.startTime).toEqual(edited.lengths[6].startTime);
  });

  it("passes validateExport against the edited model", () => {
    expect(validateExport(encoded, edited).ok).toBe(true);
  });
});

describe("encodeSwimFit with a non-metric (yard) pool length", () => {
  const a = decodeSwimFit(bytes);
  // 22.86 m/yd-pool is the classic float-noise generator: 22 × 22.86 =
  // 502.91999999999996 in raw JS arithmetic — and 22 is exactly the active
  // length count the golden ops leave behind, so this reproduces the bug
  // precisely as reported rather than by coincidence.
  const yardActivity: SwimActivity = { ...a, session: { ...a.session, poolLength: 22.86 } };
  const edited = applyEdits(yardActivity, [
    { type: "merge", lengthIndexes: [6, 7, 8] },
    { type: "merge", lengthIndexes: [18, 19] },
    { type: "merge", lengthIndexes: [20, 21] },
  ]);
  const encoded = encodeSwimFit(edited);

  it("does not spuriously block export on binary floating-point distance noise", () => {
    expect(edited.session.numActiveLengths).toBe(22);
    expect(edited.session.totalDistance).toBe(502.92); // not 502.91999999999996
    const v = validateExport(encoded, edited);
    expect(v).toEqual({ ok: true, problems: [] });
  });
});

describe("split lengths round-trip through encoding", () => {
  it("both halves survive encode→decode value-exact", () => {
    const a = decodeSwimFit(bytes);
    const edited = applyEdits(a, [{ type: "split", lengthIndex: 0, parts: 2 }]);
    const back = decodeSwimFit(encodeSwimFit(edited));
    expect(validateExport(encodeSwimFit(edited), edited)).toEqual({ ok: true, problems: [] });
    expect(back.lengths).toHaveLength(44);
    expect(back.session.totalDistance).toBe(1350);
    for (const i of [0, 1]) {
      expect(back.lengths[i].totalStrokes).toBe(14);
      expect(back.lengths[i].totalTimerTime).toBeCloseTo(31.343, 2);
      expect((back.lengths[i] as { avgSpeed?: number }).avgSpeed).toBeCloseTo(1.595, 3);
      expect(back.lengths[i].swimStroke).toBe("freestyle");
    }
    back.lengths.forEach((l, i) => expect(l.messageIndex).toBe(i));
  });
});

describe("devices that emit vendor-only messages (e.g. Venu 3S training_settings)", () => {
  it("skips raw messages that decoded to an empty object instead of crashing", () => {
    const a = decodeSwimFit(bytes);
    // A message whose fields are all unknown to the SDK profile decodes to {};
    // Encoder.onMesg(num, {}) throws "Could not write Message".
    const withEmpty = {
      ...a,
      raw: [...a.raw.slice(0, 36), { mesgNum: 13, mesg: {} }, ...a.raw.slice(36)],
    };
    const encoded = encodeSwimFit(withEmpty);
    expect(validateExport(encoded, withEmpty)).toEqual({ ok: true, problems: [] });
  });
});

describe("validateExport failure modes", () => {
  const a = decodeSwimFit(bytes);

  it("rejects corrupted bytes", () => {
    const encoded = encodeSwimFit(a);
    const corrupted = encoded.slice();
    corrupted[100] ^= 0xff;
    const v = validateExport(corrupted, a);
    expect(v.ok).toBe(false);
    expect(v.problems.length).toBeGreaterThan(0);
  });

  it("rejects a mismatch against the expected model", () => {
    const edited = applyEdits(a, [{ type: "toRest", lengthIndexes: [6] }]);
    const encodedOriginal = encodeSwimFit(a);
    const v = validateExport(encodedOriginal, edited);
    expect(v.ok).toBe(false);
  });
});
