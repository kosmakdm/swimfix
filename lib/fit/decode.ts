import { Decoder, Stream } from "@garmin/fitsdk";
import type { HrSample, LapData, LengthData, RawMesg, SessionData, SwimActivity } from "./types";

export class FitDecodeError extends Error {
  problems: string[];
  constructor(message: string, problems: string[] = []) {
    super(message);
    this.name = "FitDecodeError";
    this.problems = problems;
  }
}

export function decodeSwimFit(bytes: Uint8Array): SwimActivity {
  const stream = Stream.fromByteArray(bytes);
  if (!Decoder.isFIT(stream)) {
    throw new FitDecodeError("This file is not a FIT file.");
  }
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) {
    throw new FitDecodeError("This FIT file is corrupt (failed integrity check).");
  }

  const raw: RawMesg[] = [];
  const { messages, errors } = decoder.read({
    mesgListener: (mesgNum: number, mesg: object) =>
      raw.push({ mesgNum, mesg: mesg as Record<string, unknown> }),
  });
  if (errors.length > 0) {
    throw new FitDecodeError(
      "The FIT file could not be fully decoded.",
      errors.map((e: unknown) => String(e)),
    );
  }

  const session = (messages.sessionMesgs?.[0] ?? null) as SessionData | null;
  if (!session || session.sport !== "swimming" || typeof session.poolLength !== "number") {
    throw new FitDecodeError(
      "This is not a pool-swim activity (expected sport=swimming with a pool length).",
    );
  }

  const lengths = (messages.lengthMesgs ?? []) as unknown as LengthData[];
  const laps = (messages.lapMesgs ?? []) as unknown as LapData[];
  const hr: HrSample[] = ((messages.recordMesgs ?? []) as Array<Record<string, unknown>>)
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date)
    .map((r) => ({ t: r.timestamp as Date, bpm: r.heartRate as number }));

  return { session, laps, lengths, hr, raw };
}
