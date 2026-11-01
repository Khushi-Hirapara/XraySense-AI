import { cn } from "@/lib/utils";
import { niceCountTicks } from "@/lib/chart-ticks";
import { CLASS_STYLES, FALLBACK_CLASS_STYLE, formatPercent, type Histogram } from "@/lib/dataset-eda";

const AXIS_TEXT = "fill-slate-500 text-[10px] dark:fill-slate-400";
const GRID_LINE = "stroke-slate-100 dark:stroke-slate-800";

const styleFor = (label: string) => CLASS_STYLES[label] ?? FALLBACK_CLASS_STYLE;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
      {message}
    </div>
  );
}

export function ClassLegend({ classNames }: { classNames: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
      {classNames.map((label) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", styleFor(label).bar)} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Class distribution (counts + percentages)                                  */
/* -------------------------------------------------------------------------- */

export function ClassDistributionBars({
  classNames,
  counts,
  percentages,
}: {
  classNames: string[];
  counts: Record<string, number>;
  percentages: Record<string, number | null>;
}) {
  const max = Math.max(1, ...classNames.map((c) => counts[c] ?? 0));
  return (
    <ul className="space-y-4" aria-label="Images per class">
      {classNames.map((label) => {
        const count = counts[label] ?? 0;
        return (
          <li key={label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("font-semibold", styleFor(label).text)}>{label}</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-300">
                {count.toLocaleString()}{" "}
                <span className="text-slate-500 dark:text-slate-400">({formatPercent(percentages[label])})</span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={cn("h-full rounded-full", styleFor(label).bar)}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Split comparison (grouped bars)                                            */
/* -------------------------------------------------------------------------- */

export interface SplitGroup {
  label: string;
  sublabel?: string;
  counts: Record<string, number>;
}

export function SplitComparisonChart({
  groups,
  classNames,
  mode,
}: {
  groups: SplitGroup[];
  classNames: string[];
  mode: "count" | "percent";
}) {
  if (groups.length === 0) return <EmptyChart message="No splits to compare." />;

  const width = 860;
  const height = 300;
  const padL = 52;
  const padR = 12;
  const padT = 24;
  const padB = 48;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const share = (g: SplitGroup, label: string) => {
    const total = classNames.reduce((s, c) => s + (g.counts[c] ?? 0), 0);
    return total ? (g.counts[label] ?? 0) / total : null;
  };
  const value = (g: SplitGroup, label: string) =>
    mode === "percent" ? (share(g, label) ?? 0) : (g.counts[label] ?? 0);
  const countAxis = niceCountTicks(Math.max(...groups.flatMap((g) => classNames.map((c) => g.counts[c] ?? 0))));
  const max = mode === "percent" ? 1 : countAxis.max;
  const ticks = mode === "percent" ? [0, 0.25, 0.5, 0.75, 1] : countAxis.ticks;
  const groupW = plotW / groups.length;
  const barW = Math.min(52, (groupW - 32) / classNames.length);
  const sy = (v: number) => padT + (1 - v / max) * plotH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto h-auto w-full max-w-4xl" role="img" aria-label="Class counts per split">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} className={GRID_LINE} />
          <text x={padL - 6} y={sy(t) + 3} textAnchor="end" className={AXIS_TEXT}>
            {mode === "percent" ? `${Math.round(t * 100)}%` : t.toLocaleString()}
          </text>
        </g>
      ))}
      {groups.map((g, gi) => {
        const x0 = padL + gi * groupW + (groupW - barW * classNames.length) / 2;
        return (
          <g key={g.label}>
            {classNames.map((label, ci) => {
              const v = value(g, label);
              const x = x0 + ci * barW;
              const text = mode === "percent" ? formatPercent(v, 0) : (g.counts[label] ?? 0).toLocaleString();
              return (
                <g key={label}>
                  <rect
                    x={x + 2}
                    y={sy(v)}
                    width={barW - 4}
                    height={Math.max(sy(0) - sy(v), v > 0 ? 1 : 0)}
                    rx={3}
                    className={styleFor(label).fill}
                  >
                    <title>{`${g.label} · ${label}: ${(g.counts[label] ?? 0).toLocaleString()} (${formatPercent(share(g, label))})`}</title>
                  </rect>
                  <text x={x + barW / 2} y={sy(v) - 4} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-200">
                    {text}
                  </text>
                </g>
              );
            })}
            <text x={padL + gi * groupW + groupW / 2} y={height - 26} textAnchor="middle" className="fill-slate-700 text-[12px] font-semibold dark:fill-slate-200">
              {g.label}
            </text>
            {g.sublabel ? (
              <text x={padL + gi * groupW + groupW / 2} y={height - 12} textAnchor="middle" className={AXIS_TEXT}>
                {g.sublabel}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Class share per split (100% stacked)                                       */
/* -------------------------------------------------------------------------- */

export function ClassShareStack({ groups, classNames }: { groups: SplitGroup[]; classNames: string[] }) {
  return (
    <ul className="space-y-3">
      {groups.map((g) => {
        const total = classNames.reduce((s, c) => s + (g.counts[c] ?? 0), 0);
        return (
          <li key={g.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{g.label}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{total.toLocaleString()} images</span>
            </div>
            {total === 0 ? (
              <div className="h-6 rounded-md bg-slate-100 text-center text-[11px] leading-6 text-slate-500 dark:bg-slate-800">
                No images
              </div>
            ) : (
              <div className="flex h-6 overflow-hidden rounded-md">
                {classNames.map((label) => {
                  const share = (g.counts[label] ?? 0) / total;
                  if (share === 0) return null;
                  return (
                    <div
                      key={label}
                      className={cn("flex items-center justify-center text-[10px] font-semibold text-white", styleFor(label).bar)}
                      style={{ width: `${share * 100}%` }}
                      title={`${label}: ${(g.counts[label] ?? 0).toLocaleString()} (${formatPercent(share)})`}
                    >
                      {share >= 0.08 ? formatPercent(share, 0) : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Stacked histogram (image width / height)                                   */
/* -------------------------------------------------------------------------- */

export function StackedHistogram({
  histogram,
  classNames,
  axisLabel,
}: {
  histogram: Histogram | null;
  classNames: string[];
  axisLabel: string;
}) {
  if (!histogram) return <EmptyChart message="No measurable images." />;

  const width = 560;
  const height = 240;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const bins = histogram.bin_edges.length - 1;
  const totals = Array.from({ length: bins }, (_, i) =>
    classNames.reduce((s, c) => s + (histogram.counts[c]?.[i] ?? 0), 0),
  );
  const { max, ticks } = niceCountTicks(Math.max(...totals));
  const binW = plotW / bins;
  const sy = (v: number) => padT + (1 - v / max) * plotH;
  const edgeLabelEvery = Math.max(1, Math.ceil(bins / 5));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${axisLabel} histogram`}>
      {ticks.map((t, i) => (
        <g key={`${t}-${i}`}>
          <line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} className={GRID_LINE} />
          <text x={padL - 6} y={sy(t) + 3} textAnchor="end" className={AXIS_TEXT}>
            {t.toLocaleString()}
          </text>
        </g>
      ))}
      {Array.from({ length: bins }, (_, i) => {
        let base = 0;
        const lo = Math.round(histogram.bin_edges[i]!);
        const hi = Math.round(histogram.bin_edges[i + 1]!);
        return (
          <g key={i}>
            {classNames.map((label) => {
              const n = histogram.counts[label]?.[i] ?? 0;
              if (!n) return null;
              const y = sy(base + n);
              const h = sy(base) - y;
              base += n;
              return (
                <rect key={label} x={padL + i * binW + 1} y={y} width={binW - 2} height={Math.max(h, 1)} className={styleFor(label).fill}>
                  <title>{`${lo}–${hi} px · ${label}: ${n}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {histogram.bin_edges.map((edge, i) =>
        i % edgeLabelEvery === 0 || i === bins ? (
          <text key={i} x={padL + i * binW} y={padT + plotH + 14} textAnchor="middle" className={AXIS_TEXT}>
            {Math.round(edge)}
          </text>
        ) : null,
      )}
      <text x={padL + plotW / 2} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
        {axisLabel} (px, original image)
      </text>
    </svg>
  );
}
