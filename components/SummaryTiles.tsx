"use client";
import type { SwimActivity } from "@/lib/fit/types";
import { avgPaceSecPer100, fmtDur, fmtPace } from "@/lib/ui/format";

function Tile({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta ? <div className="delta">after fixes: <strong>{delta}</strong></div> : null}
    </div>
  );
}

export default function SummaryTiles({
  before, after,
}: { before: SwimActivity; after: SwimActivity | null }) {
  const b = before;
  const a = after && after.session.totalDistance !== b.session.totalDistance ? after : null;
  const paceB = avgPaceSecPer100(b);
  const paceA = a ? avgPaceSecPer100(a) : null;
  return (
    <div className="tiles">
      <Tile
        label="Distance"
        value={`${b.session.totalDistance ?? 0} m`}
        delta={a ? `${a.session.totalDistance} m` : undefined}
      />
      <Tile
        label="Active lengths"
        value={String(b.session.numActiveLengths ?? 0)}
        delta={a ? String(a.session.numActiveLengths) : undefined}
      />
      <Tile
        label="Moving pace"
        value={paceB ? fmtPace(paceB) : "–"}
        delta={paceA ? fmtPace(paceA) : undefined}
      />
      <Tile label="Duration" value={fmtDur(b.session.totalElapsedTime)} />
    </div>
  );
}
