"use client";
import type { Proposal } from "@/lib/analysis/detect";

export default function ProposalsPanel({
  proposals, accepted, disabled, onToggle,
}: {
  proposals: Proposal[];
  accepted: Set<string>;
  disabled: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="card">
      <h2>Proposed fixes</h2>
      {proposals.length === 0 ? (
        <p className="subtitle" style={{ margin: 0 }}>
          Nothing suspicious found — this swim looks clean.
        </p>
      ) : (
        proposals.map((p) => (
          <label className="proposal" key={p.id}>
            <input
              type="checkbox"
              checked={accepted.has(p.id)}
              disabled={disabled.has(p.id)}
              onChange={() => onToggle(p.id)}
            />
            <span style={{ flex: 1 }}>{p.reason}</span>
            <span className={`badge ${p.confidence}`}>{p.confidence} confidence</span>
          </label>
        ))
      )}
    </div>
  );
}
