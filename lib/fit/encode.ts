import { Decoder, Encoder, Profile, Stream } from "@garmin/fitsdk";
import { decodeSwimFit, FitDecodeError } from "./decode";
import type { SwimActivity } from "./types";

const HR_MESG_NUM = 132;

export function encodeSwimFit(a: SwimActivity): Uint8Array {
  const { SESSION, LAP, LENGTH } = Profile.MesgNum;
  const groups: Record<number, Array<Record<string, unknown>>> = {
    [SESSION]: [a.session] as unknown as Array<Record<string, unknown>>,
    [LAP]: a.laps as unknown as Array<Record<string, unknown>>,
    [LENGTH]: a.lengths as unknown as Array<Record<string, unknown>>,
  };
  const emitted = new Set<number>();
  const encoder = new Encoder();
  for (const { mesgNum, mesg } of a.raw) {
    if (mesgNum === HR_MESG_NUM) continue;
    const group = groups[mesgNum];
    if (group) {
      if (!emitted.has(mesgNum)) {
        emitted.add(mesgNum);
        for (const m of group) encoder.onMesg(mesgNum, m);
      }
      continue;
    }
    // Some devices (e.g. Venu 3S training_settings) write messages whose
    // fields are all vendor-proprietary; they decode to {} and the Encoder
    // throws on a message with nothing to write. They carry no decodable
    // data, so dropping them loses nothing.
    if (Object.keys(mesg).length === 0) continue;
    encoder.onMesg(mesgNum, mesg);
  }
  return encoder.close();
}

export interface ExportValidation { ok: boolean; problems: string[] }

export function validateExport(bytes: Uint8Array, expected: SwimActivity): ExportValidation {
  const problems: string[] = [];
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream) || !new Decoder(Stream.fromByteArray(bytes)).checkIntegrity()) {
    return { ok: false, problems: ["Encoded file failed the FIT integrity check."] };
  }
  let back: SwimActivity;
  try {
    back = decodeSwimFit(bytes);
  } catch (e) {
    return {
      ok: false,
      problems: [e instanceof FitDecodeError ? e.message : String(e)],
    };
  }
  const check = (label: string, got: unknown, want: unknown) => {
    if (got !== want) problems.push(`${label}: expected ${String(want)}, got ${String(got)}`);
  };
  // Distances are floats derived from poolLength × count; the FIT round trip
  // settles on round(v*100)/100, so compare with a tolerance instead of
  // strict equality to avoid flagging harmless binary floating-point noise
  // (e.g. 22 × 22.86 = 502.91999999999996) as a mismatch.
  const checkClose = (label: string, got: unknown, want: unknown, tolerance: number) => {
    const g = typeof got === "number" ? got : NaN;
    const w = typeof want === "number" ? want : NaN;
    if (Number.isNaN(g) || Number.isNaN(w) || Math.abs(g - w) > tolerance) {
      problems.push(`${label}: expected ${String(want)}, got ${String(got)}`);
    }
  };
  check("length count", back.lengths.length, expected.lengths.length);
  check("lap count", back.laps.length, expected.laps.length);
  checkClose("session distance", back.session.totalDistance, expected.session.totalDistance, 0.005);
  check("active lengths", back.session.numActiveLengths, expected.session.numActiveLengths);
  back.lengths.forEach((l, i) => {
    if (l.messageIndex !== i) problems.push(`length ${i} has messageIndex ${l.messageIndex}`);
  });
  if (expected.hr.length > 0 && back.hr.length === 0) {
    problems.push("heart-rate samples were lost in encoding");
  }
  return { ok: problems.length === 0, problems };
}
