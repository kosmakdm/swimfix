"use client";
import { useState } from "react";
import Dropzone from "@/components/Dropzone";
import SummaryTiles from "@/components/SummaryTiles";
import Timeline from "@/components/Timeline";
import HrChart from "@/components/HrChart";
import { decodeSwimFit, FitDecodeError } from "@/lib/fit/decode";
import type { SwimActivity } from "@/lib/fit/types";

export default function Home() {
  const [activity, setActivity] = useState<SwimActivity | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const onBytes = (bytes: Uint8Array, name: string) => {
    setError(null);
    try {
      setActivity(decodeSwimFit(bytes));
      setFileName(name);
    } catch (e) {
      setActivity(null);
      setError(e instanceof FitDecodeError ? e.message : "Unexpected error reading the file.");
    }
  };

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
          <SummaryTiles before={activity} after={null} />
          <Timeline
            activity={activity}
            flagged={new Set<number>()}
            selected={selected}
            onSelect={setSelected}
          />
          <HrChart activity={activity} />
        </>
      )}
    </main>
  );
}
