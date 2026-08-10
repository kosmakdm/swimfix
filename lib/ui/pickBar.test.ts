import { describe, it, expect } from "vitest";
import { pickBar } from "./pickBar";

// Regression test for the Timeline hover crash: mousemove over a chart with
// zero bars used to call `Array.reduce` with no initial value, which throws
// "Reduce of empty array with no initial value". `pickBar` is the extracted,
// side-effect-free hit-test at the core of that handler.
describe("pickBar", () => {
  it("returns null instead of throwing on an empty bar list", () => {
    expect(() => pickBar([], 42)).not.toThrow();
    expect(pickBar([], 42)).toBeNull();
  });

  it("returns the bar containing px when one exists", () => {
    const bars = [
      { x0: 0, x1: 10 },
      { x0: 10, x1: 20 },
      { x0: 20, x1: 30 },
    ];
    expect(pickBar(bars, 15)).toBe(bars[1]);
  });

  it("falls back to the nearest bar when px lands in a gap", () => {
    const bars = [
      { x0: 0, x1: 10 },
      { x0: 20, x1: 30 },
    ];
    expect(pickBar(bars, 12)).toBe(bars[0]);
    expect(pickBar(bars, 19)).toBe(bars[1]);
  });
});
