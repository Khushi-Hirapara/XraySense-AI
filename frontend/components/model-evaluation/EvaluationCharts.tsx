import { cn } from "@/lib/utils";
import { formatMetric } from "@/lib/model-evaluation";

const AXIS_TEXT = "fill-slate-500 text-[10px] dark:fill-slate-400";
const GRID_LINE = "stroke-slate-100 dark:stroke-slate-800";
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function EmptyChart({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-56 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400",
        className,
      )}
    >
      {message}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Confusion matrix                                                           */
/* -------------------------------------------------------------------------- */

interface ConfusionMatrixHeatmapProps {
  labels: string[];
  /** Rows = actual, columns = predicted, in `labels` order. */
  matrix: number[][];
  className?: string;
}

/** Heatmap shaded by row share: teal on the diagonal (correct), rose off it (errors). */
export function ConfusionMatrixHeatmap({ labels, matrix, className }: ConfusionMatrixHeatmapProps) {
  const total = matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  if (total === 0) {
    return <EmptyChart message="No samples to show." className={className} />;
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[280px] border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th className="w-28" />
            <th
              colSpan={labels.length}
              className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Predicted
            </th>
          </tr>
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Actual
            </th>
            {labels.map((label) => (
              <th key={label} className="pb-1 font-semibold text-slate-700 dark:text-slate-200">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const rowTotal = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={labels[i]}>
                <th className="pr-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                  {labels[i]}
                  <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                    n = {rowTotal}
                  </span>
                </th>
                {row.map((count, j) => {
                  const share = rowTotal ? count / rowTotal : 0;
                  const correct = i === j;
                  const alpha = 0.08 + share * 0.82;
                  const color = correct ? `rgba(13, 148, 136, ${alpha})` : `rgba(225, 29, 72, ${alpha})`;
                  const strong = share > 0.5;
                  return (
                    <td
                      key={labels[j]}
                      className="rounded-lg px-2 py-3"
                      style={{ backgroundColor: count ? color : undefined }}
                      title={`Actual ${labels[i]}, predicted ${labels[j]}: ${count}`}
                    >
                      <span
                        className={cn(
                          "block text-base font-bold tabular-nums",
                          strong ? "text-white" : "text-slate-900 dark:text-slate-100",
                        )}
                      >
                        {count}
                      </span>
                      <span
                        className={cn(
                          "block text-[10px] tabular-nums",
                          strong ? "text-white/90" : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {rowTotal ? `${(share * 100).toFixed(1)}% of row` : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ROC / PR curves                                                            */
/* -------------------------------------------------------------------------- */

export interface CurveMarker {
  x: number;
  y: number;
  label: string;
}

export interface CurveSeries {
  label: string;
  points: { x: number; y: number }[];
  strokeClassName: string;
  swatchClassName: string;
}

interface UnitCurveChartProps {
  /** Single "Model" line; ignored when `series` is given. */
  points?: { x: number; y: number }[];
  /** Several labelled lines (e.g. one-vs-rest ROC per class). */
  series?: CurveSeries[];
  xLabel: string;
  yLabel: string;
  /** "diagonal" for ROC chance line, a number for a horizontal baseline (PR prevalence). */
  baseline?: "diagonal" | number;
  baselineLabel?: string;
  markers?: CurveMarker[];
  ariaLabel: string;
  className?: string;
}

const MARKER_CLASSES = [
  "fill-amber-500 stroke-white dark:stroke-slate-900",
  "fill-violet-500 stroke-white dark:stroke-slate-900",
];

/** Line chart on the unit square (both axes 0–1), used for ROC and precision-recall. */
export function UnitCurveChart({
  points = [],
  series: seriesProp,
  xLabel,
  yLabel,
  baseline,
  baselineLabel,
  markers = [],
  ariaLabel,
  className,
}: UnitCurveChartProps) {
  const series: CurveSeries[] = (
    seriesProp ?? [
      {
        label: "Model",
        points,
        strokeClassName: "stroke-teal-600 dark:stroke-teal-400",
        swatchClassName: "bg-teal-600 dark:bg-teal-400",
      },
    ]
  ).filter((s) => s.points.length >= 2);
  if (series.length === 0) {
    return <EmptyChart message="Not enough data for this curve." className={className} />;
  }

  const width = 360;
  const height = 300;
  const padL = 44;
  const padR = 14;
  const padT = 14;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const sx = (x: number) => padL + x * plotW;
  const sy = (y: number) => padT + (1 - y) * plotH;

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} className={GRID_LINE} />
            <line x1={sx(t)} x2={sx(t)} y1={padT} y2={padT + plotH} className={GRID_LINE} />
            <text x={padL - 6} y={sy(t) + 3} textAnchor="end" className={AXIS_TEXT}>
              {t.toFixed(2)}
            </text>
            <text x={sx(t)} y={padT + plotH + 14} textAnchor="middle" className={AXIS_TEXT}>
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {baseline === "diagonal" ? (
          <line
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(1)}
            y2={sy(1)}
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeDasharray="4 4"
          />
        ) : typeof baseline === "number" ? (
          <line
            x1={sx(0)}
            x2={sx(1)}
            y1={sy(baseline)}
            y2={sy(baseline)}
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeDasharray="4 4"
          />
        ) : null}

        {series.map((s) => (
          <path
            key={s.label}
            d={toPath(s.points)}
            fill="none"
            className={s.strokeClassName}
            strokeWidth={2.5}
            strokeLinejoin="round"
          >
            <title>{s.label}</title>
          </path>
        ))}

        {markers.map((m, i) => (
          <circle
            key={m.label}
            cx={sx(m.x)}
            cy={sy(m.y)}
            r={5}
            strokeWidth={2}
            className={MARKER_CLASSES[i % MARKER_CLASSES.length]}
          >
            <title>{m.label}</title>
          </circle>
        ))}

        <text x={padL + plotW / 2} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
          {xLabel}
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          className={AXIS_TEXT}
        >
          {yLabel}
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-0.5 w-4 rounded", s.swatchClassName)} aria-hidden />
            {s.label}
          </li>
        ))}
        {baselineLabel ? (
          <li className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-slate-400" aria-hidden />
            {baselineLabel}
          </li>
        ) : null}
        {markers.map((m, i) => (
          <li key={m.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                i % MARKER_CLASSES.length === 0 ? "bg-amber-500" : "bg-violet-500",
              )}
              aria-hidden
            />
            {m.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-class precision / recall / F1                                          */
/* -------------------------------------------------------------------------- */

interface PerClassMetricsChartProps {
  rows: { label: string; precision: number | null; recall: number | null; f1: number | null }[];
  className?: string;
}

const SERIES = [
  { key: "precision", label: "Precision", className: "fill-teal-500", swatch: "bg-teal-500" },
  { key: "recall", label: "Recall", className: "fill-cyan-400", swatch: "bg-cyan-400" },
  { key: "f1", label: "F1-score", className: "fill-slate-500 dark:fill-slate-400", swatch: "bg-slate-500" },
] as const;

export function PerClassMetricsChart({ rows, className }: PerClassMetricsChartProps) {
  if (rows.length === 0) {
    return <EmptyChart message="No classes to compare." className={className} />;
  }

  const width = 520;
  const height = 240;
  const padL = 40;
  const padR = 12;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / rows.length;
  const barW = Math.min(36, (groupW - 24) / SERIES.length);
  const sy = (v: number) => padT + (1 - v) * plotH;

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Per-class precision, recall and F1">
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} className={GRID_LINE} />
            <text x={padL - 6} y={sy(t) + 3} textAnchor="end" className={AXIS_TEXT}>
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}
        {rows.map((row, gi) => {
          const groupX = padL + gi * groupW + (groupW - barW * SERIES.length) / 2;
          return (
            <g key={row.label}>
              {SERIES.map((series, si) => {
                const value = row[series.key];
                const x = groupX + si * barW;
                if (value === null) {
                  return (
                    <text key={series.key} x={x + barW / 2} y={sy(0) - 4} textAnchor="middle" className={AXIS_TEXT}>
                      n/a
                    </text>
                  );
                }
                return (
                  <g key={series.key}>
                    <rect
                      x={x + 2}
                      y={sy(value)}
                      width={barW - 4}
                      height={Math.max(sy(0) - sy(value), 1)}
                      rx={4}
                      className={series.className}
                    >
                      <title>{`${row.label} ${series.label}: ${formatMetric(value)}`}</title>
                    </rect>
                    <text
                      x={x + barW / 2}
                      y={sy(value) - 4}
                      textAnchor="middle"
                      className="fill-slate-700 text-[9px] font-semibold dark:fill-slate-200"
                    >
                      {Math.round(value * 100)}
                    </text>
                  </g>
                );
              })}
              <text
                x={padL + gi * groupW + groupW / 2}
                y={height - 12}
                textAnchor="middle"
                className="fill-slate-600 text-[11px] font-semibold dark:fill-slate-300"
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", s.swatch)} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Threshold trade-off                                                        */
/* -------------------------------------------------------------------------- */

interface ThresholdTradeoffChartProps {
  rows: { threshold: number; fp: number; fn: number }[];
  /** Validation-selected threshold to highlight, if any. */
  selectedThreshold: number | null;
  className?: string;
}

/** False positives vs false negatives as the P(PNEUMONIA) threshold moves. */
export function ThresholdTradeoffChart({ rows, selectedThreshold, className }: ThresholdTradeoffChartProps) {
  if (rows.length < 2) {
    return <EmptyChart message="Not enough data for a threshold sweep." className={className} />;
  }

  const width = 560;
  const height = 260;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxCount = Math.max(1, ...rows.map((r) => Math.max(r.fp, r.fn)));
  const sx = (t: number) => padL + t * plotW;
  const sy = (v: number) => padT + (1 - v / maxCount) * plotH;
  const line = (key: "fp" | "fn") =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"} ${sx(r.threshold).toFixed(1)} ${sy(r[key]).toFixed(1)}`).join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxCount * t));

  return (
    <div className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="False positives and false negatives by threshold">
        {yTicks.map((v, i) => (
          <g key={`${v}-${i}`}>
            <line x1={padL} x2={width - padR} y1={sy(v)} y2={sy(v)} className={GRID_LINE} />
            <text x={padL - 6} y={sy(v) + 3} textAnchor="end" className={AXIS_TEXT}>
              {v}
            </text>
          </g>
        ))}
        {TICKS.map((t) => (
          <text key={t} x={sx(t)} y={padT + plotH + 14} textAnchor="middle" className={AXIS_TEXT}>
            {t.toFixed(2)}
          </text>
        ))}

        {selectedThreshold !== null ? (
          <g>
            <line
              x1={sx(selectedThreshold)}
              x2={sx(selectedThreshold)}
              y1={padT}
              y2={padT + plotH}
              className="stroke-violet-500"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text
              x={sx(selectedThreshold) + 4}
              y={padT + 10}
              className="fill-violet-600 text-[10px] font-semibold dark:fill-violet-400"
            >
              {`validation-selected ${selectedThreshold.toFixed(2)}`}
            </text>
          </g>
        ) : null}

        <path d={line("fp")} fill="none" className="stroke-rose-500" strokeWidth={2.5} strokeLinejoin="round" />
        <path d={line("fn")} fill="none" className="stroke-sky-500" strokeWidth={2.5} strokeLinejoin="round" />
        {rows.map((r) => (
          <g key={r.threshold}>
            <circle cx={sx(r.threshold)} cy={sy(r.fp)} r={2.5} className="fill-rose-500">
              <title>{`Threshold ${r.threshold.toFixed(2)}: ${r.fp} false positives`}</title>
            </circle>
            <circle cx={sx(r.threshold)} cy={sy(r.fn)} r={2.5} className="fill-sky-500">
              <title>{`Threshold ${r.threshold.toFixed(2)}: ${r.fn} false negatives`}</title>
            </circle>
          </g>
        ))}

        <text x={padL + plotW / 2} y={height - 6} textAnchor="middle" className={AXIS_TEXT}>
          Threshold on P(PNEUMONIA)
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
          className={AXIS_TEXT}
        >
          Images
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-rose-500" aria-hidden />
          False positives (normal flagged as pneumonia)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-sky-500" aria-hidden />
          False negatives (pneumonia missed)
        </li>
      </ul>
    </div>
  );
}
