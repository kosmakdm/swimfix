import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { decodeSwimFit } from "../fit/decode";
import { detectProposals } from "./detect";
import type { LengthData, SwimActivity } from "../fit/types";

const bytes = new Uint8Array(
  fs.readFileSync(new URL("../../test/fixtures/sample-swim.fit", import.meta.url)),
);

/** Synthetic activity builder: one lap owning all lengths. */
function synth(lengths: Array<Partial<LengthData>>): SwimActivity {
  const t0 = new Date("2026-01-01T10:00:00Z");
  let cursor = 0;
  const full: LengthData[] = lengths.map((p, i) => {
    const dur = p.totalTimerTime ?? 80;
    const l: LengthData = {
      messageIndex: i,
      timestamp: t0,
      startTime: new Date(t0.getTime() + cursor * 1000),
      totalElapsedTime: dur,
      totalTimerTime: dur,
      lengthType: p.lengthType ?? "active",
      swimStroke: p.swimStroke ?? "freestyle",
      totalStrokes: p.totalStrokes,
      ...p,
    };
    cursor += dur;
    return l;
  });
  return {
    session: {
      startTime: t0, totalElapsedTime: cursor, totalTimerTime: cursor,
      poolLength: 50, sport: "swimming",
    },
    laps: [{
      messageIndex: 0, startTime: t0, totalElapsedTime: cursor, totalTimerTime: cursor,
      firstLengthIndex: 0, numLengths: full.length,
      numActiveLengths: full.filter((l) => l.lengthType === "active").length,
    }],
    lengths: full,
    hr: [],
    raw: [],
  };
}

// 8 normal freestyle lengths: 30–34 strokes over 78–86 s. The spread matters —
// identical durations would make the robust seconds-MAD zero, and with σ = 0
// no merge candidate could ever fit the band.
const NORMAL = Array.from({ length: 8 }, (_, i) => ({
  totalStrokes: 30 + (i % 5),
  totalTimerTime: 78 + (i % 5) * 2,
}));

describe("detectProposals — synthetic cases", () => {
  it("merges a fragment pair that sums to one normal length", () => {
    const a = synth([...NORMAL,
      { totalStrokes: 12, totalTimerTime: 30 },
      { totalStrokes: 15, totalTimerTime: 50 },
    ]);
    const ids = detectProposals(a).map((p) => p.id);
    expect(ids).toContain("merge:8-9");
  });

  it("merges a lone fragment into its right neighbor", () => {
    const a = synth([...NORMAL,
      { totalStrokes: 8, totalTimerTime: 20 },
      { totalStrokes: 25, totalTimerTime: 62 },
    ]);
    const ids = detectProposals(a).map((p) => p.id);
    expect(ids).toContain("merge:8-9");
  });

  it("proposes rest for a fragment that fits nothing", () => {
    // 3 strokes / 8 s wedged between two normal lengths: merging either way
    // busts the stroke band, so it must become rest
    const a = synth([...NORMAL.slice(0, 4),
      { totalStrokes: 3, totalTimerTime: 8 },
      ...NORMAL.slice(4),
    ]);
    const props = detectProposals(a);
    const rest = props.find((p) => p.op.type === "toRest");
    expect(rest?.id).toBe("toRest:4");
  });

  it("flags nothing on a clean swim", () => {
    expect(detectProposals(synth(NORMAL))).toHaveLength(0);
  });

  it("relabels a mislabeled normal-looking length", () => {
    const a = synth([
      ...NORMAL,
      { totalStrokes: 31, swimStroke: "breaststroke" },
      { totalStrokes: 14 }, // tail length so the mislabel isn't the array end
    ]);
    // breaststroke has no per-stroke baseline here (n=1 < minGroupSamples),
    // so the relabel takes the low-confidence path — that's the point:
    const props = detectProposals(a);
    const relabel = props.find((p) => p.op.type === "relabel");
    expect(relabel).toBeDefined();
    expect(relabel!.op).toMatchObject({ lengthIndex: 8, stroke: "freestyle" });
    expect(relabel!.confidence).toBe("low");
  });

  it("merges a trailing fragment into its left neighbor", () => {
    const a = synth([...NORMAL, { totalStrokes: 3, totalTimerTime: 4 }]);
    const ids = detectProposals(a).map((p) => p.id);
    expect(ids).toContain("merge:7-8");
  });

  it("never proposes a single-index merge, even when a noisy baseline lets a lone fragment fit the band alone", () => {
    // Two widely separated stroke/second clusters give a huge robust MAD (and
    // thus a huge σ) — wide enough that an isolated low-stroke fragment can
    // satisfy the ±3σ merge band all by itself. It's still classified a
    // "fragment" (well under fragmentStrokeRatio × median), and its run is
    // exactly one length long (neither neighbor is a fragment). Before the
    // fix, candidate A (the run-alone candidate) would have accepted this and
    // emitted `merge:4` — a single-index merge that applyEdits rejects
    // outright ("A merge needs at least two lengths"). It must instead fall
    // through to a right/left extension (or toRest).
    const a = synth([
      { totalStrokes: 100, totalTimerTime: 200 },
      { totalStrokes: 100, totalTimerTime: 200 },
      { totalStrokes: 100, totalTimerTime: 200 },
      { totalStrokes: 100, totalTimerTime: 200 },
      { totalStrokes: 30, totalTimerTime: 60 }, // lone fragment, index 4
      { totalStrokes: 200, totalTimerTime: 400 },
      { totalStrokes: 200, totalTimerTime: 400 },
      { totalStrokes: 200, totalTimerTime: 400 },
      { totalStrokes: 200, totalTimerTime: 400 },
    ]);
    const props = detectProposals(a);

    for (const p of props) {
      if (p.op.type !== "merge") continue;
      expect(p.op.lengthIndexes.length).toBeGreaterThanOrEqual(2);
      for (let k = 1; k < p.op.lengthIndexes.length; k++) {
        expect(p.op.lengthIndexes[k]).toBe(p.op.lengthIndexes[k - 1] + 1);
      }
    }

    // sanity: the fragment at index 4 was in fact exercised by the fix path
    // (proves the assertions above aren't vacuously true over an empty list)
    const touchesFragment = props.some((p) =>
      p.op.type === "relabel" ? p.op.lengthIndex === 4 : p.op.lengthIndexes.includes(4),
    );
    expect(touchesFragment).toBe(true);
  });

  it("applies the σ floor so a metronomic baseline (zero MAD) still merges a near-median fragment pair", () => {
    // 8 identical lengths give a robust MAD of exactly 0 for both strokes
    // and seconds, i.e. sigma() alone would be 0 — a zero-width merge band
    // that only an exact-median sum could ever satisfy. Two fragments
    // summing to 31 strokes / 81 s (1 off the 30/80 median in both) must
    // still merge thanks to the minStrokeSigma/minSecondsSigma floors.
    const metronomic = Array.from({ length: 8 }, () => ({ totalStrokes: 30, totalTimerTime: 80 }));
    const a = synth([
      ...metronomic,
      { totalStrokes: 14, totalTimerTime: 38 },
      { totalStrokes: 17, totalTimerTime: 43 },
    ]);
    const props = detectProposals(a);
    expect(props.map((p) => p.id)).toEqual(["merge:8-9"]);
    expect(props[0].confidence).toBe("high");
  });
});

describe("detectProposals — golden test on the real swim", () => {
  const a = decodeSwimFit(bytes);
  const props = detectProposals(a);

  it("finds exactly the three merge proposals and nothing else", () => {
    expect(props.map((p) => p.id).sort()).toEqual([
      "merge:18-19", "merge:20-21", "merge:6-7-8",
    ]);
  });

  it("grades confidence correctly", () => {
    const byId = Object.fromEntries(props.map((p) => [p.id, p]));
    expect(byId["merge:6-7-8"].confidence).toBe("high");   // 37 strokes / 96s vs 32.5/86
    expect(byId["merge:18-19"].confidence).toBe("high");   // 34 strokes / 88s
    expect(byId["merge:20-21"].confidence).toBe("medium"); // 41 strokes / 120s — fits 3σ not 2σ
  });

  it("every proposal explains itself with numbers", () => {
    for (const p of props) {
      expect(p.reason).toMatch(/\d+/);
      expect(p.reason.length).toBeGreaterThan(30);
    }
  });
});
