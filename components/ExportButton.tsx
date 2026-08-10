"use client";
import { useState } from "react";
import type { SwimActivity } from "@/lib/fit/types";
import { encodeSwimFit, validateExport } from "@/lib/fit/encode";

export default function ExportButton({
  corrected, fileName,
}: { corrected: SwimActivity | null; fileName: string }) {
  const [problems, setProblems] = useState<string[]>([]);

  const download = () => {
    if (!corrected) return;
    const bytes = encodeSwimFit(corrected);
    const check = validateExport(bytes, corrected);
    if (!check.ok) {
      setProblems(check.problems);
      return;
    }
    setProblems([]);
    const name = fileName.replace(/\.fit$/i, "") + "_fixed.fit";
    const blob = new Blob([bytes.slice().buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <h2>Export</h2>
      {problems.length > 0 ? (
        <div className="error">
          <strong>Export blocked — the corrected file failed validation:</strong>
          <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      ) : null}
      <button className="action primary" disabled={!corrected} onClick={download}>
        Download corrected FIT
      </button>
      <p className="subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
        {corrected
          ? "In Garmin Connect: delete the original activity first, then import this file (it de-duplicates by start time)."
          : "Accept a proposal or make a manual edit to enable export."}
      </p>
    </div>
  );
}
