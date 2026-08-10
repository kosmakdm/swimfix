"use client";
import { useMemo, useState } from "react";
import type { SwimActivity } from "@/lib/fit/types";
import { HR_COLOR } from "@/lib/ui/strokeColors";
import { fmtClock } from "@/lib/ui/format";
import ChartTooltip, { type TooltipState } from "./ChartTooltip";

const W = 1000;
const H = 120;
const PAD = 6;

export default function HrChart({ activity }: { activity: SwimActivity }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const t0 = activity.session.startTime.getTime() / 1000;
  const total = activity.session.totalElapsedTime;

  const { points, yOf, ticks } = useMemo(() => {
    const bpms = activity.hr.map((s) => s.bpm);
    const lo = Math.min(...bpms) - 5;
    const hi = Math.max(...bpms) + 5;
    const yOf = (bpm: number) => H - PAD - ((bpm - lo) / (hi - lo)) * (H - 2 * PAD);
    const points = activity.hr.map((s) => ({
      x: ((s.t.getTime() / 1000 - t0) / total) * W,
      y: yOf(s.bpm),
      s,
    }));
    const ticks = [60, 120, 180].filter((b) => b > lo && b < hi);
    return { points, yOf, ticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  if (activity.hr.length === 0) return null;

  const hover = (clientX: number, clientY: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(p.x - px) < Math.abs(best.x - px)) best = p;
    setCursor(best.x);
    setTip({
      x: clientX - rect.left,
      y: clientY - rect.top,
      lines: [
        { value: `${best.s.bpm} bpm`, label: "" },
        { value: fmtClock(best.s.t), label: "" },
      ],
    });
  };

  return (
    <div className="card">
      <h2>Heart rate</h2>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: H, display: "block" }}
          preserveAspectRatio="none"
          role="img"
          aria-label="Heart rate over the session"
          onMouseMove={(e) => hover(e.clientX, e.clientY, e.currentTarget)}
          onMouseLeave={() => { setTip(null); setCursor(null); }}
        >
          {ticks.map((b) => (
            <g key={b}>
              <line x1={0} x2={W} y1={yOf(b)} y2={yOf(b)} stroke="var(--grid)" strokeWidth={1} />
              <text x={4} y={yOf(b) - 3} fontSize={10} fill="var(--text-muted)">{b}</text>
            </g>
          ))}
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={HR_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {cursor != null ? (
            <line x1={cursor} x2={cursor} y1={0} y2={H} stroke="var(--axis)" strokeWidth={1} />
          ) : null}
        </svg>
        <ChartTooltip state={tip} />
      </div>
    </div>
  );
}
