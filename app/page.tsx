"use client";
import { useMemo, useState } from "react";
import Dropzone from "@/components/Dropzone";
import SummaryTiles from "@/components/SummaryTiles";
import Timeline from "@/components/Timeline";
import HrChart from "@/components/HrChart";
import ProposalsPanel from "@/components/ProposalsPanel";
import { decodeSwimFit, FitDecodeError } from "@/lib/fit/decode";
import type { SwimActivity } from "@/lib/fit/types";
import { detectProposals, type Proposal, type EditOp } from "@/lib/analysis/detect";
import { applyEdits, lengthsTouched } from "@/lib/edit/apply";

export default function Home() {
  const [activity, setActivity] = useState<SwimActivity | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [manualOps, setManualOps] = useState<EditOp[]>([]);

  const onBytes = (bytes: Uint8Array, name: string) => {
    setError(null);
    try {
      const a = decodeSwimFit(bytes);
      setActivity(a);
      setFileName(name);
      const props = detectProposals(a);
      setProposals(props);
      setAccepted(new Set(props.map((p) => p.id)));
      setManualOps([]);
      setSelected(null);
    } catch (e) {
      setActivity(null);
      setError(e instanceof FitDecodeError ? e.message : "Unexpected error reading the file.");
    }
  };

  const activeOps = useMemo<EditOp[]>(
    () => [
      ...proposals.filter((p) => accepted.has(p.id)).map((p) => p.op),
      ...manualOps,
    ],
    [proposals, accepted, manualOps],
  );

  const corrected = useMemo(() => {
    if (!activity || activeOps.length === 0) return null;
    try {
      return applyEdits(activity, activeOps);
    } catch {
      return null;
    }
  }, [activity, activeOps]);

  const flagged = useMemo(
    () => new Set(proposals.flatMap((p) => lengthsTouched(p.op))),
    [proposals],
  );

  const manualTouched = useMemo(
    () => new Set(manualOps.flatMap(lengthsTouched)),
    [manualOps],
  );
  const disabledProposals = useMemo(
    () => new Set(
      proposals
        .filter((p) => lengthsTouched(p.op).some((i) => manualTouched.has(i)))
        .map((p) => p.id),
    ),
    [proposals, manualTouched],
  );

  return (
    <main>
      <h1>SwimFix</h1>
      <p className="subtitle">
        Find and fix phantom lengths in Garmin pool-swim FIT files — entirely in your browser.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {!activity ? (
        <Dropzone onBytes={onBytes} />
      ) : (
        <>
          <p className="subtitle">{fileName}</p>
          <SummaryTiles before={activity} after={corrected} />
          <ProposalsPanel
            proposals={proposals}
            accepted={accepted}
            disabled={disabledProposals}
            onToggle={(id) =>
              setAccepted((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
          <Timeline
            activity={activity}
            flagged={flagged}
            selected={selected}
            onSelect={setSelected}
          />
          <HrChart activity={activity} />
        </>
      )}
    </main>
  );
}
