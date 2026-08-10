"use client";
import type { SwimActivity, SwimStroke } from "@/lib/fit/types";
import type { EditOp } from "@/lib/analysis/detect";
import { fmtClock, fmtDur } from "@/lib/ui/format";
import { STROKE_COLOR } from "@/lib/ui/strokeColors";

const STROKES: SwimStroke[] = ["freestyle", "backstroke", "breaststroke", "butterfly", "drill", "mixed", "im"];

export default function LengthTable({
  activity, flagged, blocked, selected, onSelect, onManualOp, manualOps, onClearManual, manualTouched,
}: {
  activity: SwimActivity;
  flagged: Set<number>;
  blocked: Set<number>;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onManualOp: (op: EditOp) => void;
  manualOps: EditOp[];
  onClearManual: () => void;
  manualTouched: Set<number>;
}) {
  const sel = selected != null ? activity.lengths[selected] : null;
  const lapOf = (i: number) =>
    activity.laps.findIndex((lap) => {
      const first = lap.firstLengthIndex ?? -1;
      const n = lap.numLengths ?? 0;
      return first >= 0 && n > 0 && i >= first && i < first + n;
    });
  const canMergeWith = (i: number, j: number) =>
    j >= 0 && j < activity.lengths.length &&
    activity.lengths[i].lengthType === "active" &&
    activity.lengths[j].lengthType === "active" &&
    lapOf(i) === lapOf(j) && lapOf(i) !== -1 &&
    !blocked.has(i) && !blocked.has(j) &&
    !manualTouched.has(i) && !manualTouched.has(j);

  const blockTitle = "Covered by an accepted proposal — untick it first to edit manually.";
  const manualTitle = "Already covered by one of your manual edits — Clear manual edits to change it.";

  return (
    <div className="card">
      <h2>All lengths</h2>
      {sel != null && selected != null ? (
        <div className="row-actions">
          <strong>Length {selected + 1}:</strong>
          <button
            className="action"
            disabled={!canMergeWith(selected, selected - 1)}
            title={blocked.has(selected) ? blockTitle : manualTouched.has(selected) ? manualTitle : "Merge into the previous length"}
            onClick={() => onManualOp({ type: "merge", lengthIndexes: [selected - 1, selected] })}
          >Merge ↑</button>
          <button
            className="action"
            disabled={!canMergeWith(selected, selected + 1)}
            title={blocked.has(selected) ? blockTitle : manualTouched.has(selected) ? manualTitle : "Merge into the next length"}
            onClick={() => onManualOp({ type: "merge", lengthIndexes: [selected, selected + 1] })}
          >Merge ↓</button>
          <button
            className="action"
            disabled={sel.lengthType !== "active" || blocked.has(selected) || manualTouched.has(selected)}
            title={blocked.has(selected) ? blockTitle : manualTouched.has(selected) ? manualTitle : "Count this as rest instead of a length"}
            onClick={() => onManualOp({ type: "toRest", lengthIndexes: [selected] })}
          >Convert to rest</button>
          <select
            className="action"
            disabled={sel.lengthType !== "active" || blocked.has(selected) || manualTouched.has(selected)}
            title={blocked.has(selected) ? blockTitle : manualTouched.has(selected) ? manualTitle : "Relabel this length's stroke"}
            value={sel.swimStroke ?? ""}
            onChange={(e) =>
              onManualOp({ type: "relabel", lengthIndex: selected, stroke: e.target.value as SwimStroke })}
          >
            {STROKES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {manualOps.length > 0 ? (
            <button className="action" onClick={onClearManual}>
              Clear manual edits ({manualOps.length})
            </button>
          ) : null}
        </div>
      ) : (
        <p className="subtitle" style={{ marginBottom: 8 }}>
          Click a row (or a bar in the timeline) to edit it manually.
          {manualOps.length > 0 ? ` ${manualOps.length} manual edit(s) pending.` : ""}
        </p>
      )}
      <table className="lengths">
        <thead>
          <tr>
            <th>#</th><th>Start</th><th>Type</th><th>Stroke</th>
            <th>Duration</th><th>Strokes</th><th>Cadence</th><th></th>
          </tr>
        </thead>
        <tbody>
          {activity.lengths.map((l, i) => (
            <tr
              key={i}
              className={[
                l.lengthType === "idle" ? "rest" : "",
                flagged.has(i) ? "flagged" : "",
                selected === i ? "selected" : "",
              ].join(" ").trim()}
              onClick={() => onSelect(selected === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(selected === i ? null : i);
                }
              }}
              tabIndex={0}
              aria-selected={selected === i}
              style={{ cursor: "pointer" }}
            >
              <td>{i + 1}</td>
              <td>{fmtClock(l.startTime)}</td>
              <td>{l.lengthType}</td>
              <td>
                {l.swimStroke ? (
                  <span className="key">
                    <span className="swatch" style={{ background: STROKE_COLOR[l.swimStroke] }} />
                    {l.swimStroke}
                  </span>
                ) : "–"}
              </td>
              <td>{fmtDur(l.totalTimerTime)}</td>
              <td>{l.totalStrokes ?? "–"}</td>
              <td>{l.avgSwimmingCadence ?? "–"}</td>
              <td>{flagged.has(i) ? "▲" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
