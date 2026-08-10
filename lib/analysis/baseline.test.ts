import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "../fit/decode";
import { buildBaselines, robustStats, sigma, statsFor } from "./baseline";

const bytes = new Uint8Array(
  fs.readFileSync(new URL("../../test/fixtures/sample-swim.fit", import.meta.url)),
);

describe("robustStats", () => {
  it("computes median and MAD", () => {
    const s = robustStats([1, 2, 3, 4, 100]);
    expect(s.median).toBe(3);
    expect(s.mad).toBe(1); // deviations [2,1,0,1,97] -> median 1
    expect(s.n).toBe(5);
  });
  it("handles even counts", () => {
    expect(robustStats([1, 2, 3, 4]).median).toBe(2.5);
  });
  it("handles empty input", () => {
    expect(robustStats([]).n).toBe(0);
  });
});

describe("buildBaselines on the real swim", () => {
  const a = decodeSwimFit(bytes);
  const b = buildBaselines(a.lengths);

  it("freestyle strokes: median 32.5, MAD 2.5, n 20", () => {
    const fs20 = b.byStroke.get("freestyle")!;
    expect(fs20.strokes.n).toBe(20);
    expect(fs20.strokes.median).toBeCloseTo(32.5);
    expect(fs20.strokes.mad).toBeCloseTo(2.5);
    expect(fs20.seconds.median).toBeCloseTo(86.126, 2);
  });

  it("breaststroke strokes: median 29.5, n 6", () => {
    const br = b.byStroke.get("breaststroke")!;
    expect(br.strokes.n).toBe(6);
    expect(br.strokes.median).toBeCloseTo(29.5);
  });

  it("overall covers all 26 active lengths", () => {
    expect(b.overall.strokes.n).toBe(26);
  });

  it("statsFor falls back to overall for sparse strokes", () => {
    expect(statsFor(b, "butterfly", 4)).toBe(b.overall);
    expect(statsFor(b, "freestyle", 4)).toBe(b.byStroke.get("freestyle"));
  });

  it("sigma converts MAD", () => {
    expect(sigma({ median: 0, mad: 2.5, n: 10 })).toBeCloseTo(3.7065);
  });
});
