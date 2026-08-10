declare module "@garmin/fitsdk" {
  export const Stream: {
    fromByteArray(bytes: Uint8Array): unknown;
    fromArrayBuffer(buf: ArrayBuffer): unknown;
    fromBuffer(buf: Buffer): unknown;
  };
  export class Decoder {
    constructor(stream: unknown);
    static isFIT(stream: unknown): boolean;
    checkIntegrity(): boolean;
    read(options?: Record<string, unknown>): {
      messages: Record<string, Array<Record<string, unknown>>>;
      errors: unknown[];
    };
  }
  export class Encoder {
    onMesg(mesgNum: number, mesg: Record<string, unknown>): this;
    close(): Uint8Array;
  }
  export const Profile: { MesgNum: Record<string, number>; [key: string]: unknown };
}
