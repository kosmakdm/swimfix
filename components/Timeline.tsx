"use client";
import { useMemo, useState } from "react";
import type { SwimActivity } from "@/lib/fit/types";
import { FLAG_COLOR, REST_COLOR, STROKE_COLOR } from "@/lib/ui/strokeColors";
import { fmtClock, fmtDur } from "@/lib/ui/format";
import ChartTooltip, { type TooltipState } from "./ChartTooltip";

const W = 1000;
const H = 64;

export default function Timeline({
  activity, flagged, selected, onSelect,
}: {
  activity: SwimActivity;
  flagged: Set<number>;
  selected: number | null;
  onSelect: (lengthIndex: number | null) => void;
}) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const t0 = activity.session.startTime.getTime() / 1000;
  const total = activity.session.totalElapsedTime;
  const x = (sec: number) => ((sec - t0) / total) * W;

  const bars = useMemo(() => activity.lengths.map((l, i) => {
    const start = l.startTime.getTime() / 1000;
    return {
      i,
      x0: x(start),
      x1: x(start + l.totalElapsedTime),
      rest: l.lengthType === "idle",
      color: l.lengthType === "idle" ? REST_COLOR : STROKE_COLOR[l.swimStroke ?? "mixed"],
      length: l,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activity]);

  const strokes = [...new Set(
    activity.lengths.filter((l) => l.lengthType === "active" && l.swimStroke)
      .map((l) => l.swimStroke as string),
  )];

  const hover = (clientX: number, clientY: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const bar = bars.find((b) => px >= b.x0 && px < b.x1) ??
      bars.reduce((best, b) =>
        Math.abs((b.x0 + b.x1) / 2 - px) < Math.abs((best.x0 + best.x1) / 2 - px) ? b : best);
    const l = bar.length;
    setTip({
      x: clientX - rect.left,
      y: clientY - rect.top,
      lines: [
        { value: `Length ${bar.i + 1}`, label: flagged.has(bar.i) ? "▲ flagged" : "" },
        { value: l.lengthType === "idle" ? "rest" : (l.swimStroke ?? "active"), label: "" },
        { value: fmtDur(l.totalTimerTime), label: "duration" },
        { value: l.totalStrokes != null ? String(l.totalStrokes) : "–", label: "strokes" },
        { value: fmtClock(l.startTime), label: "start" },
      ],
    });
    return bar.i;
  };

  return (
    <div className="card">
      <h2>Lengths</h2>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: 64, display: "block" }}
          preserveAspectRatio="none"
          role="img"
          aria-label="Timeline of pool lengths; details in the table below"
          onMouseMove={(e) => hover(e.clientX, e.clientY, e.currentTarget)}
          onMouseLeave={() => setTip(null)}
          onClick={(e) => onSelect(hover(e.clientX, e.clientY, e.currentTarget))}
        >
          {bars.map((b) => (
            <g key={b.i}>
              <rect
                x={b.x0 + 1}
                width={Math.max(b.x1 - b.x0 - 2, 1)}
                y={b.rest ? 20 : 8}
                height={b.rest ? 12 : 24}
                rx={2}
                fill={b.color}
                stroke={selected === b.i ? "var(--text-primary)" : "none"}
                strokeWidth={2}
              />
              {flagged.has(b.i) ? (
                <path
                  d={`M ${(b.x0 + b.x1) / 2 - 5} 52 l 5 -8 l 5 8 z`}
                  fill={FLAG_COLOR}
                />
              ) : null}
            </g>
          ))}
        </svg>
        <ChartTooltip state={tip} />
      </div>
      <div className="legend">
        {strokes.map((s) => (
          <span className="key" key={s}>
            <span className="swatch" style={{ background: STROKE_COLOR[s] }} />{s}
          </span>
        ))}
        <span className="key"><span className="swatch" style={{ background: REST_COLOR }} />rest</span>
        <span className="key"><span style={{ color: FLAG_COLOR }}>▲</span>flagged</span>
      </div>
    </div>
  );
}
