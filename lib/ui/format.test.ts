import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "../fit/decode";
import { activeSeconds, avgPaceSecPer100, fmtDur, fmtPace } from "./format";

const bytes = new Uint8Array(
  fs.readFileSync(new URL("../../test/fixtures/sample-swim.fit", import.meta.url)),
);

describe("format", () => {
  it("fmtDur", () => {
    expect(fmtDur(96.2)).toBe("1:36");
    expect(fmtDur(2711)).toBe("45:11");
    expect(fmtDur(3753)).toBe("1:02:33");
  });
  it("fmtPace", () => {
    expect(fmtPace(127)).toBe("2:07 /100m");
  });
  it("activeSeconds and pace on the real swim", () => {
    const a = decodeSwimFit(bytes);
    const active = activeSeconds(a);
    expect(active).toBeGreaterThan(1000);
    expect(active).toBeLessThan(2696);
    const pace = avgPaceSecPer100(a)!;
    expect(pace).toBeCloseTo((active / 1300) * 100, 5);
  });
});
