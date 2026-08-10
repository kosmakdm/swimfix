export interface DetectConfig {
  /** Active length is a fragment if strokes < ratio × group median. */
  fragmentStrokeRatio: number;
  /** Merge candidate must land within median ± this many σ (strokes AND seconds). */
  mergeBandSigmas: number;
  /** Tighter band ⇒ high confidence. */
  highConfidenceSigmas: number;
  /** Minimum per-stroke sample size before falling back to overall stats. */
  minGroupSamples: number;
  /** toRest confidence is medium when run strokes ≤ ratio × median, else low. */
  toRestStrokeRatio: number;
  /** Share of a lap's actives that must agree for a relabel majority. */
  relabelMajority: number;
  /** Minimum non-fragment actives in a lap before relabel logic applies. */
  minLapActives: number;
}

export const DEFAULT_CONFIG: DetectConfig = {
  fragmentStrokeRatio: 0.6,
  mergeBandSigmas: 3,
  highConfidenceSigmas: 2,
  minGroupSamples: 4,
  toRestStrokeRatio: 0.3,
  relabelMajority: 2 / 3,
  minLapActives: 3,
};
