"use client";

export interface TooltipState {
  x: number;
  y: number;
  lines: Array<{ label: string; value: string }>;
}

export default function ChartTooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  return (
    <div className="tooltip" style={{ left: state.x + 12, top: state.y + 12 }}>
      {state.lines.map((l, i) => (
        <div key={i}>
          <span className="val">{l.value}</span>{" "}
          <span className="lbl">{l.label}</span>
        </div>
      ))}
    </div>
  );
}
