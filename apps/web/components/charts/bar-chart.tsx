'use client';

import { useEffect, useRef, useState } from 'react';

export interface Bar { label: string; value: number; tip?: string }

/** Round tick step: 1, 2 or 5 × 10^n (never below 1: the charts count things). */
function niceStep(max: number, target = 4) {
  if (max <= target) return 1;
  const raw = Math.max(max, 1) / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Bar with a 4px rounded data end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Single-series vertical bar chart (SVG). One hue (brand), thin bars with a 2px gap, recessive
 * axes, a tooltip on every bar and a "Show data" table, so the numbers never depend on colour.
 */
export function BarChart({ data, title, valueLabel, height = 180, format = (n) => String(n), testId }: {
  data: Bar[]; title: string; valueLabel: string; height?: number; format?: (n: number) => string; testId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(0, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const band = data.length ? innerW / data.length : innerW;
  const bw = Math.max(1, Math.min(24, band - 2));
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;
  const h = hover === null ? null : data[hover];

  return (
    <figure className="relative" data-testid={testId}>
      <figcaption className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</figcaption>
      <div ref={box} className="relative w-full">
        <svg width={width} height={height} role="img" aria-label={`${title}: bar chart, ${data.length} bars`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-slate-300 dark:stroke-slate-600' : 'stroke-slate-100 dark:stroke-slate-800'} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * band + (band - bw) / 2;
            const bh = Math.max(0, y(0) - y(d.value));
            return (
              <g key={i}>
                {bh > 0 && <path d={barPath(x, y(d.value), bw, bh)} className={hover === i ? 'fill-brand-700 dark:fill-brand-100' : 'fill-brand-600 dark:fill-brand-500'} />}
                {i % every === 0 && (
                  <text x={pad.l + i * band + band / 2} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">{d.label}</text>
                )}
                {/* Hit target: the whole column, larger than the bar. */}
                <rect x={pad.l + i * band} y={pad.t} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900"
            style={{ left: Math.min(width - 140, Math.max(0, pad.l + hover * band + band / 2 - 60)), top: Math.max(0, y(h.value) - 44) }}
          >
            <div className="text-slate-500 dark:text-slate-400">{h.tip ?? h.label}</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{valueLabel}: {format(h.value)}</div>
          </div>
        )}
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Show data</summary>
        <table className="mt-1 w-full max-w-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-0.5 font-normal">Label</th><th className="text-right font-normal">{valueLabel}</th></tr></thead>
          <tbody>{data.map((d, i) => <tr key={i}><td className="py-0.5">{d.tip ?? d.label}</td><td className="text-right tabular-nums">{format(d.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** A headline number with a label (no chart needed for a single value). */
export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" data-testid="stat">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}
