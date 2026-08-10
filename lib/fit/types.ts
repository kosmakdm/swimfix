export type SwimStroke =
  | "freestyle" | "backstroke" | "breaststroke" | "butterfly"
  | "drill" | "mixed" | "im";

export interface LengthData {
  messageIndex: number;
  timestamp: Date;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  lengthType: "active" | "idle";
  totalStrokes?: number;
  avgSwimmingCadence?: number;
  swimStroke?: SwimStroke;
  totalCalories?: number;
  event?: string;
  eventType?: string;
}

/** Decoded lap message. Fields we recompute are typed; everything else passes
 *  through untouched via the index signature so encoding preserves it. */
export interface LapData {
  messageIndex: number;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  firstLengthIndex?: number;
  numLengths?: number;
  numActiveLengths?: number;
  totalDistance?: number;
  totalStrokes?: number;
  totalCycles?: number;
  swimStroke?: SwimStroke;
  avgStrokeDistance?: number;
  enhancedAvgSpeed?: number;
  [key: string]: unknown;
}

export interface SessionData {
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  poolLength: number;
  sport: string;
  subSport?: string;
  totalDistance?: number;
  numActiveLengths?: number;
  totalStrokes?: number;
  totalCycles?: number;
  avgStrokeDistance?: number;
  enhancedAvgSpeed?: number;
  [key: string]: unknown;
}

export interface HrSample {
  t: Date;
  bpm: number;
}

export interface RawMesg {
  mesgNum: number;
  mesg: Record<string, unknown>;
}

export interface SwimActivity {
  session: SessionData;
  laps: LapData[];
  lengths: LengthData[];
  hr: HrSample[];
  raw: RawMesg[];
}
