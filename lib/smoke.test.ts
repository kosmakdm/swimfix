import { describe, it, expect } from "vitest";
import * as fs from "node:fs";

describe("scaffold", () => {
  it("fixture exists and is a FIT file (header byte 12-15 spells '.FIT')", () => {
    const buf = fs.readFileSync(new URL("../test/fixtures/sample-swim.fit", import.meta.url));
    expect(buf.subarray(8, 12).toString("ascii")).toBe(".FIT");
  });
});
