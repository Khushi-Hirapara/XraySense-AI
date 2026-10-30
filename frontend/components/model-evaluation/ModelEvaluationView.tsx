"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Crosshair,
  Cpu,
  FlaskConical,
  Gauge,
  Info,
  Layers,
  ShieldAlert,
  Target,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { Card } from "@/components/ui/Card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import {
  ConfusionMatrixHeatmap,
  PerClassMetricsChart,
  ThresholdTradeoffChart,
  UnitCurveChart,
  type CurveMarker,
  type CurveSeries,
} from "@/components/model-evaluation/EvaluationCharts";
import {
  fetchModelEvaluation,
  formatMetric,
  formatThreshold,
  ModelEvaluationError,
  type ClassificationReport,
  type ModelEvaluationResponse,
  type OperatingPoint,
} from "@/lib/model-evaluation";
import { cn } from "@/lib/utils";

/** Same class colours as the rest of the app (dashboard cards, Dataset EDA). */
const CLASS_CURVE_STYLES: Record<string, { stroke: string; swatch: string }> = {
  NORMAL: { stroke: "stroke-emerald-500", swatch: "bg-emerald-500" },
  PNEUMONIA: { stroke: "stroke-rose-500", swatch: "bg-rose-500" },
  COVID: { stroke: "stroke-amber-500", swatch: "bg-amber-500" },
};

function SectionTitle({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
  );
}

function PartHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 pb-4 dark:border-slate-700">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h2>
      <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</div>
    </div>
  );
}

function ThresholdBadge({ point }: { point: OperatingPoint }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
      {point.threshold === null ? "Rule: argmax" : `Threshold ${formatThreshold(point)} · analysis only`}
    </span>
  );
}

function AcademicDisclaimer() {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/45 dark:text-amber-100">
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="leading-relaxed">
        XRaySense AI is an academic decision-support prototype, not a clinically validated diagnostic
        system. These metrics come from a public research dataset and do not establish clinical safety or
        effectiveness. Do not use them to justify diagnostic decisions.
      </p>
    </div>
  );
}

interface ReportTableProps {
  report: ClassificationReport;
  /** Optional per-class one-vs-rest ROC-AUC column. */
  auc?: { perClass: Record<string, number | null>; macro: number | null; weighted: number | null };
}

function ReportTable({ report, auc }: ReportTableProps) {
  const rows: {
    label: string;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    support: number | null;
    auc?: number | null;
  }[] = [
    ...report.classes.map((c) => ({ ...c, auc: auc?.perClass[c.label] ?? null })),
    { label: "Macro avg", ...report.macro_avg, support: report.total_support, auc: auc?.macro ?? null },
    { label: "Weighted avg", ...report.weighted_avg, support: report.total_support, auc: auc?.weighted ?? null },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th className="py-2 pr-3 font-semibold">Class</th>
            <th className="py-2 pr-3 text-right font-semibold">Precision</th>
            <th className="py-2 pr-3 text-right font-semibold">Recall</th>
            <th className="py-2 pr-3 text-right font-semibold">F1-score</th>
            {auc ? <th className="py-2 pr-3 text-right font-semibold">ROC-AUC (OvR)</th> : null}
            <th className="py-2 text-right font-semibold">Support</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row, i) => (
            <tr
              key={row.label}
              className={cn(
                "border-b border-slate-100 dark:border-slate-800",
                i === report.classes.length && "border-t-2 border-t-slate-200 dark:border-t-slate-700",
              )}
            >
              <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{row.label}</td>
              <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">{formatMetric(row.precision)}</td>
              <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">{formatMetric(row.recall)}</td>
              <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">{formatMetric(row.f1)}</td>
              {auc ? (
                <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                  {row.auc === null || row.auc === undefined ? "—" : row.auc.toFixed(3)}
                </td>
              ) : null}
              <td className="py-2 text-right text-slate-700 dark:text-slate-300">{row.support ?? "—"}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">Accuracy</td>
            <td colSpan={auc ? 4 : 3} className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
              {formatMetric(report.accuracy)}
            </td>
            <td className="py-2 text-right text-slate-700 dark:text-slate-300">{report.total_support}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Support = number of test images whose true class is that label. &ldquo;—&rdquo; means the metric is
        undefined (e.g. no samples or no predictions for that class).
      </p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function countsText(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([name, n]) => `${name} ${n}`)
    .join(" · ");
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  return (
    <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {items.length ? items.map((s) => <li key={s}>{s}</li>) : <li>{empty}</li>}
    </ul>
  );
}

export function ModelEvaluationView() {
  const [data, setData] = useState<ModelEvaluationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notGenerated: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string>("argmax");

  useEffect(() => {
    let cancelled = false;
    fetchModelEvaluation()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError({
          message: err instanceof Error ? err.message : "Could not load the evaluation report.",
          notGenerated: err instanceof ModelEvaluationError && err.status === 404,
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const report = data?.report;
  const points = useMemo(() => report?.operating_points ?? [], [report]);
  const selected = points.find((p) => p.id === selectedId) ?? points[0];

  const markers = useMemo(
    () =>
      points.map((p) => ({
        label: p.label,
        roc:
          p.metrics.recall !== null && p.metrics.specificity !== null
            ? { x: 1 - p.metrics.specificity, y: p.metrics.recall }
            : null,
        pr:
          p.metrics.recall !== null && p.metrics.precision !== null
            ? { x: p.metrics.recall, y: p.metrics.precision }
            : null,
      })),
    [points],
  );

  const ovrSeries = useMemo<CurveSeries[]>(
    () =>
      (report?.multiclass.roc_curves_ovr ?? []).map((c) => ({
        label: `${c.label} vs rest (AUC ${c.auc.toFixed(3)})`,
        points: c.points.map((p) => ({ x: p.fpr, y: p.tpr })),
        strokeClassName: CLASS_CURVE_STYLES[c.label]?.stroke ?? "stroke-slate-500",
        swatchClassName: CLASS_CURVE_STYLES[c.label]?.swatch ?? "bg-slate-500",
      })),
    [report],
  );

  const mc = report?.multiclass;
  const mcReport = mc?.classification_report;

  return (
    <div className="page-content flex flex-1 flex-col gap-8">
      <PageHeader
        title="Model Evaluation"
        description="Held-out test-set performance of the deployed three-class chest X-ray classifier (NORMAL, PNEUMONIA, COVID)."
      />

      {isLoading && <LoadingPanel message="Loading evaluation report…" />}

      {!isLoading && error && (
        <ErrorAlert
          title={error.notGenerated ? "Evaluation report not generated yet" : "Evaluation unavailable"}
          message={error.message}
        />
      )}

      {!isLoading && !error && report && mc && mcReport && (
        <>
          <AcademicDisclaimer />

          {data?.model_matches_report === false && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100"
            >
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden />
              <p className="leading-relaxed">
                The deployed model file differs from the model evaluated in this report (SHA-256 mismatch). These
                results describe <strong>{report.model.version_label}</strong> as evaluated on{" "}
                {new Date(report.generated_at).toLocaleString()}, not necessarily the model currently serving
                predictions. Regenerate the report with <code>python model/build_evaluation_report.py</code>.
              </p>
            </div>
          )}

          <div className="flex gap-3 rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-4 text-sm text-teal-950 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
            <div className="leading-relaxed">
              <p className="font-semibold">
                How the deployed model predicts: {report.production_decision.rule} over{" "}
                {report.production_decision.classes.join(" / ")}
              </p>
              <p className="mt-1">{report.production_decision.description}</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(report.label_mapping).map(([name, idx]) => (
                  <span
                    key={name}
                    className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-xs ring-1 ring-teal-200 dark:bg-slate-900 dark:ring-teal-800"
                  >
                    {name}={idx}
                  </span>
                ))}
              </p>
            </div>
          </div>

          <Card>
            <SectionTitle title="Evaluation setup" />
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Evaluated model">
                {report.model.version_label} ({report.model.file_name})
                <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">
                  sha256 {report.model.sha256.slice(0, 12)}…
                </span>
              </Fact>
              <Fact label="Test set (held out)">
                {report.datasets.test.total} images — {countsText(report.datasets.test.class_counts)}
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {report.datasets.test.source}
                  {report.datasets.test.invalid_predictions_excluded
                    ? `; ${report.datasets.test.invalid_predictions_excluded} invalid predictions excluded`
                    : ""}
                </span>
              </Fact>
              <Fact label="Preprocessing">
                {report.preprocessing.description}
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Report generated {new Date(report.generated_at).toLocaleString()}
                </span>
              </Fact>
            </dl>
          </Card>

          {/* ------------------------------------------------------------------ */}
          {/* Primary: three-class evaluation                                     */}
          {/* ------------------------------------------------------------------ */}
          <section aria-labelledby="three-class-heading" className="flex flex-col gap-6">
            <PartHeading id="three-class-heading" eyebrow="Primary evaluation" title="Three-class evaluation">
              All {mc.total} test images, every class included, scored with the production {mc.decision_rule} rule.
              Confusion-matrix rows are the true class and columns the predicted class.
            </PartHeading>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardStatCard
                label="3-class accuracy"
                value={formatMetric(mcReport.accuracy)}
                sub={`${mcReport.total_support} test images · argmax`}
                accent="teal"
                icon={Target}
              />
              <DashboardStatCard
                label="Macro F1"
                value={formatMetric(mcReport.macro_avg.f1)}
                sub="Unweighted mean over classes"
                accent="cyan"
                icon={Gauge}
              />
              <DashboardStatCard
                label="Weighted F1"
                value={formatMetric(mcReport.weighted_avg.f1)}
                sub="Weighted by class support"
                accent="slate"
                icon={Layers}
              />
              <DashboardStatCard
                label="Macro ROC-AUC (OvR)"
                value={mc.roc_auc_ovr.macro === null ? "—" : mc.roc_auc_ovr.macro.toFixed(3)}
                sub={
                  mc.roc_auc_ovr.weighted === null
                    ? "Unavailable"
                    : `Weighted ${mc.roc_auc_ovr.weighted.toFixed(3)} · threshold-independent`
                }
                accent="rose"
                icon={FlaskConical}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">3×3 confusion matrix</h3>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                    Rule: argmax
                  </span>
                </div>
                <ConfusionMatrixHeatmap labels={mc.labels} matrix={mc.confusion_matrix} />
              </Card>
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Classification report</h3>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                    Rule: argmax
                  </span>
                </div>
                <ReportTable
                  report={mcReport}
                  auc={{ perClass: mc.roc_auc_ovr.per_class, macro: mc.roc_auc_ovr.macro, weighted: mc.roc_auc_ovr.weighted }}
                />
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <SectionTitle title="Per-class precision, recall and F1" description="Rule: argmax over all three classes." />
                <PerClassMetricsChart rows={mcReport.classes} />
              </Card>
              <Card>
                <SectionTitle
                  title="One-vs-rest ROC curves"
                  description={mc.roc_auc_ovr.method}
                />
                {ovrSeries.length > 0 ? (
                  <UnitCurveChart
                    series={ovrSeries}
                    xLabel="False positive rate"
                    yLabel="True positive rate"
                    baseline="diagonal"
                    baselineLabel="Chance"
                    ariaLabel="One-vs-rest ROC curves for each class"
                  />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {mc.roc_auc_ovr.note ?? "Multiclass ROC-AUC is unavailable for this report."}
                  </p>
                )}
                {mc.roc_auc_ovr.note && ovrSeries.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{mc.roc_auc_ovr.note}</p>
                ) : null}
              </Card>
            </div>

            <Card>
              <SectionTitle title="Interpretation — three-class model" description="Generated from the computed metrics above." />
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Strengths</h4>
                  <BulletList items={report.interpretation.strengths} empty="No notable strengths identified by the summary rules." />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Limitations</h4>
                  <BulletList items={report.interpretation.limitations} empty="None identified." />
                </div>
              </div>
            </Card>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* Secondary: binary analysis                                          */}
          {/* ------------------------------------------------------------------ */}
          {selected ? (
            <section aria-labelledby="binary-heading" className="flex flex-col gap-6">
              <PartHeading id="binary-heading" eyebrow="Secondary analysis" title="Binary Analysis (Normal vs Pneumonia)">
                A pneumonia-vs-normal view for comparison with binary screening studies. It is <strong>not</strong> how
                the deployed model makes decisions.
              </PartHeading>

              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
                <div className="space-y-1 leading-relaxed">
                  <p>
                    <strong>Included:</strong> {report.binary_task.included_samples} test images labelled{" "}
                    {report.binary_task.included_classes.join(" or ")} (
                    {report.binary_task.included_classes
                      .map((c) => `${c} ${report.datasets.test.class_counts[c] ?? 0}`)
                      .join(", ")}
                    ). Positive class: {report.positive_class}.
                  </p>
                  <p>
                    <strong>Excluded:</strong> {report.binary_task.excluded_samples} images labelled{" "}
                    {report.binary_task.excluded_classes.join(", ") || "—"} (covered by the three-class evaluation above).
                  </p>
                  <p>
                    <strong>COVID predictions:</strong> {report.binary_task.argmax_predicted_covid} included images were
                    predicted COVID by argmax; they count as &ldquo;not pneumonia&rdquo; here.
                  </p>
                  <p>
                    <strong>Thresholds:</strong> the {report.threshold_selection.selected_threshold?.toFixed(2) ?? "—"}{" "}
                    P(PNEUMONIA) threshold was chosen on validation data ({report.threshold_selection.method}) and is shown
                    for analysis only. Production uses no threshold.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">{selected.decision_rule}</p>
                <div role="group" aria-label="Binary decision rule" className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  {points.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === selected.id}
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                        p.id === selected.id
                          ? "bg-white text-teal-800 shadow-sm dark:bg-slate-900 dark:text-teal-300"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <DashboardStatCard label="Binary accuracy" value={formatMetric(selected.metrics.accuracy)} sub={`${report.binary_task.included_samples} images`} accent="teal" icon={Target} />
                <DashboardStatCard label="Precision" value={formatMetric(selected.metrics.precision)} sub="Pneumonia PPV" accent="cyan" icon={Crosshair} />
                <DashboardStatCard label="Sensitivity" value={formatMetric(selected.metrics.recall)} sub={`${selected.metrics.fn} pneumonia missed`} accent="emerald" icon={Activity} />
                <DashboardStatCard label="Specificity" value={formatMetric(selected.metrics.specificity)} sub={`${selected.metrics.fp} normal flagged`} accent="amber" icon={ShieldAlert} />
                <DashboardStatCard label="F1-score" value={formatMetric(selected.metrics.f1)} sub={selected.threshold === null ? "Rule: argmax" : `Threshold ${formatThreshold(selected)}`} accent="slate" icon={Gauge} />
                <DashboardStatCard
                  label="Binary ROC-AUC"
                  value={report.curves.roc ? report.curves.roc.auc.toFixed(3) : "—"}
                  sub="P(PNEUMONIA), NORMAL vs PNEUMONIA"
                  accent="rose"
                  icon={FlaskConical}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Binary confusion matrix</h3>
                    <ThresholdBadge point={selected} />
                  </div>
                  <ConfusionMatrixHeatmap labels={selected.confusion_matrix.labels} matrix={selected.confusion_matrix.matrix} />
                </Card>
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Binary classification report</h3>
                    <ThresholdBadge point={selected} />
                  </div>
                  <ReportTable report={selected.classification_report} />
                </Card>
              </div>

              <Card>
                <SectionTitle
                  title="Binary decision rules compared"
                  description="Each column is a separate result on the same NORMAL/PNEUMONIA test images; they are never mixed."
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Metric</th>
                        {points.map((p) => (
                          <th key={p.id} className="py-2 pr-3 text-right font-semibold">
                            {p.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Decision", (p: OperatingPoint) => (p.threshold === null ? "argmax" : `P ≥ ${formatThreshold(p)}`)],
                          ["Used in production", (p: OperatingPoint) => (p.threshold === null ? "Yes (as 3-class argmax)" : "No")],
                          ["Accuracy", (p: OperatingPoint) => formatMetric(p.metrics.accuracy)],
                          ["Precision", (p: OperatingPoint) => formatMetric(p.metrics.precision)],
                          ["Sensitivity", (p: OperatingPoint) => formatMetric(p.metrics.recall)],
                          ["Specificity", (p: OperatingPoint) => formatMetric(p.metrics.specificity)],
                          ["F1-score", (p: OperatingPoint) => formatMetric(p.metrics.f1)],
                          ["False positives", (p: OperatingPoint) => String(p.metrics.fp)],
                          ["False negatives", (p: OperatingPoint) => String(p.metrics.fn)],
                        ] as const
                      ).map(([label, get]) => (
                        <tr key={label} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{label}</td>
                          {points.map((p) => (
                            <td key={p.id} className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                              {get(p)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <SectionTitle
                    title={`Binary ROC curve${report.curves.roc ? ` — AUC ${report.curves.roc.auc.toFixed(3)}` : ""}`}
                    description="Score: P(PNEUMONIA) on the NORMAL/PNEUMONIA test images. Markers show each binary decision rule."
                  />
                  {report.curves.roc ? (
                    <UnitCurveChart
                      points={report.curves.roc.points.map((p) => ({ x: p.fpr, y: p.tpr }))}
                      xLabel="False positive rate (1 − specificity)"
                      yLabel="True positive rate (sensitivity)"
                      baseline="diagonal"
                      baselineLabel="Chance"
                      markers={markers.flatMap((m) => (m.roc ? [{ ...m.roc, label: m.label } satisfies CurveMarker] : []))}
                      ariaLabel="Binary ROC curve"
                    />
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      ROC is undefined because the test set lacks NORMAL or PNEUMONIA images.
                    </p>
                  )}
                </Card>
                <Card>
                  <SectionTitle
                    title={`Precision-recall curve${
                      report.curves.precision_recall
                        ? ` — AP ${report.curves.precision_recall.average_precision.toFixed(3)}`
                        : ""
                    }`}
                    description="Dashed line: pneumonia prevalence among the included images."
                  />
                  {report.curves.precision_recall ? (
                    <UnitCurveChart
                      points={report.curves.precision_recall.points.map((p) => ({ x: p.recall, y: p.precision }))}
                      xLabel="Recall (sensitivity)"
                      yLabel="Precision"
                      baseline={report.curves.precision_recall.prevalence}
                      baselineLabel={`Prevalence ${formatMetric(report.curves.precision_recall.prevalence)}`}
                      markers={markers.flatMap((m) => (m.pr ? [{ ...m.pr, label: m.label } satisfies CurveMarker] : []))}
                      ariaLabel="Binary precision-recall curve"
                    />
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Precision-recall is undefined because the test set has no PNEUMONIA images.
                    </p>
                  )}
                </Card>
              </div>

              <Card>
                <SectionTitle
                  title="Threshold trade-off (analysis only)"
                  description={`False positives vs false negatives on the NORMAL/PNEUMONIA test images as a P(PNEUMONIA) threshold changes. ${report.threshold_sweep.note} Production does not use a threshold.`}
                />
                <ThresholdTradeoffChart
                  rows={report.threshold_sweep.rows}
                  selectedThreshold={report.threshold_selection.selected_threshold}
                />
              </Card>

              <Card>
                <SectionTitle title="Notes — binary analysis" />
                <BulletList items={report.interpretation.binary_notes} empty="No notes." />
              </Card>
            </section>
          ) : null}

          <AcademicDisclaimer />
        </>
      )}
    </div>
  );
}
