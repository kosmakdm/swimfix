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
  /** Floor for stroke-count σ so metronomic swimmers never get a zero-width band. */
  minStrokeSigma: number;
  /** Floor for duration σ (seconds), same reason. */
  minSecondsSigma: number;
  /** Length is a missed-turn candidate when strokes AND seconds ≥ ratio × median. */
  splitRatio: number;
}

export const DEFAULT_CONFIG: DetectConfig = {
  fragmentStrokeRatio: 0.6,
  mergeBandSigmas: 3,
  highConfidenceSigmas: 2,
  minGroupSamples: 4,
  toRestStrokeRatio: 0.3,
  relabelMajority: 2 / 3,
  minLapActives: 3,
  minStrokeSigma: 1,
  minSecondsSigma: 2,
  splitRatio: 1.7,
};
