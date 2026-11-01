"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CircleCheck,
  Database,
  ImageIcon,
  Info,
  Layers,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { Card } from "@/components/ui/Card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import {
  ClassDistributionBars,
  ClassLegend,
  ClassShareStack,
  SplitComparisonChart,
  StackedHistogram,
  type SplitGroup,
} from "@/components/dataset-eda/EdaCharts";
import {
  CLASS_STYLES,
  DatasetEdaError,
  fetchDatasetEda,
  fetchDatasetSampleUrl,
  formatPercent,
  type DatasetEdaReport,
  type DatasetEdaResponse,
  type DatasetFinding,
  type DatasetSample,
} from "@/lib/dataset-eda";
import { cn } from "@/lib/utils";

const STAT_ACCENTS = { NORMAL: "emerald", PNEUMONIA: "rose", COVID: "amber" } as const;

function SectionTitle({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition sm:text-sm",
            o.value === value
              ? "bg-white text-teal-800 shadow-sm dark:bg-slate-900 dark:text-teal-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const FINDING_STYLES: Record<DatasetFinding["severity"], { icon: typeof Info; className: string }> = {
  error: { icon: AlertCircle, className: "text-rose-600 dark:text-rose-400" },
  warning: { icon: TriangleAlert, className: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, className: "text-sky-600 dark:text-sky-400" },
};

function QualityRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  const Icon = ok ? CircleCheck : TriangleAlert;
  return (
    <li className="flex gap-3 py-2.5">
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}
        aria-hidden
      />
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{detail}</p>
      </div>
    </li>
  );
}

function SampleCard({ sample }: { sample: DatasetSample }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchDatasetSampleUrl(sample.id)
      .then((u) => {
        objectUrl = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sample.id]);

  const style = CLASS_STYLES[sample.label];
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
      <div className="flex aspect-square items-center justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, not optimisable
          <img src={url} alt={`${sample.label} chest X-ray sample`} className="h-full w-full object-contain" />
        ) : failed ? (
          <span className="px-2 text-center text-xs text-slate-400">Image unavailable</span>
        ) : (
          <span className="h-6 w-6 animate-pulse rounded-full bg-slate-700" aria-label="Loading image" />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 bg-white px-3 py-2 text-xs dark:bg-slate-900">
        <span className={cn("font-semibold", style?.text)}>{sample.label}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          {sample.width}×{sample.height}
        </span>
      </figcaption>
    </figure>
  );
}

function splitGroups(report: DatasetEdaReport, view: "disk" | "training"): SplitGroup[] {
  const bySplit = Object.fromEntries(report.splits.map((s) => [s.split, s]));
  if (view === "training" && report.training_usage) {
    return [
      { label: "Train (fit)", sublabel: "80% of dataset/train", counts: report.training_usage.fit },
      { label: "Validation", sublabel: "20% of dataset/train", counts: report.training_usage.validation },
      ...(bySplit.test ? [{ label: "Test", sublabel: "dataset/test", counts: bySplit.test.class_counts }] : []),
    ];
  }
  return report.splits.map((s) => ({
    label: s.split,
    sublabel: s.exists ? `dataset/${s.split}` : "missing",
    counts: s.class_counts,
  }));
}

function statRange(stats: { min: number; max: number } | null): string {
  return stats ? `${Math.round(stats.min)}–${Math.round(stats.max)}` : "—";
}

export function DatasetEdaView() {
  const [data, setData] = useState<DatasetEdaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; notGenerated: boolean } | null>(null);
  const [splitView, setSplitView] = useState<"training" | "disk">("training");
  const [splitMode, setSplitMode] = useState<"count" | "percent">("count");

  useEffect(() => {
    let cancelled = false;
    fetchDatasetEda()
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError({
          message: err instanceof Error ? err.message : "Could not load the dataset report.",
          notGenerated: err instanceof DatasetEdaError && err.status === 404,
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
  const classNames = useMemo(() => report?.class_names ?? [], [report]);
  const effectiveView = report?.training_usage ? splitView : "disk";
  const groups = useMemo(() => (report ? splitGroups(report, effectiveView) : []), [report, effectiveView]);

  const imbalance = useMemo(() => {
    if (!report) return null;
    const counts = report.training_usage?.fit ?? report.splits[0]?.class_counts ?? {};
    const present = Object.entries(counts).filter(([, n]) => n > 0);
    if (present.length < 2) return null;
    present.sort((a, b) => b[1] - a[1]);
    const [largest, smallest] = [present[0]!, present[present.length - 1]!];
    return { largest, smallest, ratio: largest[1] / smallest[1] };
  }, [report]);

  return (
    <div className="page-content flex flex-1 flex-col gap-8">
      <PageHeader
        title="Dataset EDA"
        description="Composition, image properties and data-quality checks for the chest X-ray dataset used to train and test the model."
      />

      {isLoading && <LoadingPanel message="Loading dataset report…" />}

      {!isLoading && error && (
        <ErrorAlert
          title={error.notGenerated ? "Dataset report not generated yet" : "Dataset report unavailable"}
          message={error.message}
        />
      )}

      {!isLoading && !error && report && (
        <>
          {data?.dataset_matches_report === false && (
            <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/45 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <p>
                The dataset folders have changed since this report was generated on{" "}
                {new Date(report.generated_at).toLocaleString()}. Regenerate it with{" "}
                <code>python model/build_dataset_eda.py</code>.
              </p>
            </div>
          )}
          {data && !data.dataset_available && (
            <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
              <p>
                The dataset directory is not present on this server, so this saved report cannot be checked against it.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStatCard
              label="Total images"
              value={report.overall.total.toLocaleString()}
              sub={`${report.splits.filter((s) => s.exists).length} split folders on disk`}
              accent="teal"
              icon={Database}
            />
            {classNames.map((label) => (
              <DashboardStatCard
                key={label}
                label={label}
                value={(report.overall.class_counts[label] ?? 0).toLocaleString()}
                sub={`${formatPercent(report.overall.class_percentages[label])} of all images`}
                accent={STAT_ACCENTS[label as keyof typeof STAT_ACCENTS] ?? "slate"}
                icon={ImageIcon}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Class distribution" description="All splits combined, from the files in each class folder." />
              <ClassDistributionBars
                classNames={classNames}
                counts={report.overall.class_counts}
                percentages={report.overall.class_percentages}
              />
            </Card>
            <Card>
              <SectionTitle title="Class percentages per split" description="Share of each class within a split." />
              <ClassShareStack groups={groups} classNames={classNames} />
              <div className="mt-4">
                <ClassLegend classNames={classNames} />
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Train / validation / test split</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {report.training_usage ? (
                    <>
                      <strong>Validation is not a separate folder.</strong> {report.training_usage.description}{" "}
                      {report.training_usage.unused_splits.length > 0 &&
                        `The dataset/${report.training_usage.unused_splits.join(", dataset/")} folder exists on disk but is not used.`}
                    </>
                  ) : (
                    "The training-time split could not be reconstructed, so only on-disk folders are shown."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.training_usage ? (
                  <Toggle
                    label="Split view"
                    value={splitView}
                    onChange={setSplitView}
                    options={[
                      { value: "training", label: "As used in training" },
                      { value: "disk", label: "Folders on disk" },
                    ]}
                  />
                ) : null}
                <Toggle
                  label="Value type"
                  value={splitMode}
                  onChange={setSplitMode}
                  options={[
                    { value: "count", label: "Counts" },
                    { value: "percent", label: "%" },
                  ]}
                />
              </div>
            </div>
            <SplitComparisonChart groups={groups} classNames={classNames} mode={splitMode} />
            <div className="mt-2">
              <ClassLegend classNames={classNames} />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Folder on disk</th>
                    {classNames.map((c) => (
                      <th key={c} className="py-2 pr-3 text-right font-semibold">{c}</th>
                    ))}
                    <th className="py-2 pr-3 text-right font-semibold">Total</th>
                    <th className="py-2 text-right font-semibold">Non-image files</th>
                  </tr>
                </thead>
                <tbody>
                  {report.splits.map((s) => (
                    <tr key={s.split} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">
                        dataset/{s.split}
                        {!s.exists && <span className="ml-2 text-xs text-rose-600">missing</span>}
                      </td>
                      {classNames.map((c) => (
                        <td key={c} className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                          {(s.class_counts[c] ?? 0).toLocaleString()}{" "}
                          <span className="text-xs text-slate-500">({formatPercent(s.class_percentages[c], 0)})</span>
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right font-semibold text-slate-800 dark:text-slate-100">{s.total.toLocaleString()}</td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-300">{s.non_image_files}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Image dimensions"
              description={`Original width and height of ${report.image_properties.measured_images.toLocaleString()} decoded images, before resizing to the ${report.preprocessing?.model_input_size ?? "model"} px input.`}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Width</h3>
                <StackedHistogram histogram={report.image_properties.width_histogram} classNames={classNames} axisLabel="Width" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Height</h3>
                <StackedHistogram histogram={report.image_properties.height_histogram} classNames={classNames} axisLabel="Height" />
              </div>
            </div>
            <div className="mt-2">
              <ClassLegend classNames={classNames} />
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Class</th>
                    <th className="py-2 pr-3 text-right font-semibold">Median W×H</th>
                    <th className="py-2 pr-3 text-right font-semibold">Width range</th>
                    <th className="py-2 pr-3 text-right font-semibold">Height range</th>
                    <th className="py-2 pr-3 text-right font-semibold">Median aspect</th>
                    <th className="py-2 pr-3 text-right font-semibold">Distinct sizes</th>
                    <th className="py-2 pr-3 font-semibold">Format</th>
                    <th className="py-2 font-semibold">Colour mode</th>
                  </tr>
                </thead>
                <tbody>
                  {classNames.map((c) => {
                    const ip = report.image_properties;
                    const w = ip.width[c];
                    const h = ip.height[c];
                    const describe = (m: Record<string, number> | undefined) =>
                      Object.entries(m ?? {})
                        .map(([k, n]) => `${k} ${n}`)
                        .join(", ") || "—";
                    return (
                      <tr key={c} className="border-b border-slate-100 dark:border-slate-800">
                        <td className={cn("py-2 pr-3 font-semibold", CLASS_STYLES[c]?.text)}>{c}</td>
                        <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                          {w && h ? `${Math.round(w.median)}×${Math.round(h.median)}` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">{statRange(w)}</td>
                        <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">{statRange(h)}</td>
                        <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                          {ip.aspect_ratio[c] ? ip.aspect_ratio[c]!.median.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-700 dark:text-slate-300">
                          {ip.dominant_size_by_class[c]?.distinct_sizes ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{describe(ip.formats_by_class[c])}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{describe(ip.color_modes_by_class[c])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Sample images"
              description="A few downscaled training images per class, chosen deterministically by content hash. File names and metadata are not exposed; dimensions are the original image size."
            />
            {report.samples.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No sample images were generated.</p>
            ) : (
              <div className="space-y-6">
                {classNames.map((label) => {
                  const samples = report.samples.filter((s) => s.label === label);
                  if (samples.length === 0) return null;
                  return (
                    <div key={label}>
                      <h3 className={cn("mb-2 text-sm font-semibold", CLASS_STYLES[label]?.text)}>{label}</h3>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {samples.map((s) => (
                          <SampleCard key={s.id} sample={s} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="Data quality checks" />
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                <QualityRow
                  ok={report.quality.missing_folders.length === 0}
                  label="Class folders present"
                  detail={
                    report.quality.missing_folders.length
                      ? `Missing: ${report.quality.missing_folders.join(", ")}`
                      : "Every split has NORMAL, PNEUMONIA and COVID folders."
                  }
                />
                <QualityRow
                  ok={report.quality.empty_folders.length === 0}
                  label="No empty class folders"
                  detail={report.quality.empty_folders.length ? `Empty: ${report.quality.empty_folders.join(", ")}` : "Every class folder contains images."}
                />
                <QualityRow
                  ok={report.quality.unreadable.count === 0}
                  label="All images decode"
                  detail={
                    report.quality.unreadable.count
                      ? `${report.quality.unreadable.count} unreadable: ${Object.entries(report.quality.unreadable.by_folder)
                          .map(([f, n]) => `${f} ${n}`)
                          .join(", ")}`
                      : "Every image was fully decoded without errors."
                  }
                />
                <QualityRow
                  ok={report.quality.duplicates.duplicate_groups === 0}
                  label="Duplicate images"
                  detail={`${report.quality.duplicates.duplicate_groups} groups of identical files (${report.quality.duplicates.redundant_copies} extra copies). Across splits: ${
                    Object.entries(report.quality.duplicates.groups_spanning_splits)
                      .map(([k, n]) => `${k} ${n}`)
                      .join(", ") || "none"
                  }. Conflicting labels: ${report.quality.duplicates.groups_with_conflicting_labels}. ${report.quality.duplicates.method}.`}
                />
                <QualityRow
                  ok={report.quality.dimension_issues.below_min_dimension === 0}
                  label={`Images at least ${report.quality.dimension_issues.min_dimension}px per side`}
                  detail={`${report.quality.dimension_issues.below_min_dimension} smaller images; ${report.quality.dimension_issues.extreme_aspect_ratio} with an aspect ratio beyond 1.5:1; ${report.quality.dimension_issues.non_rgb_or_grayscale} in unusual colour modes.`}
                />
              </ul>
            </Card>

            <Card>
              <SectionTitle title="Class imbalance" />
              {imbalance ? (
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  In the {report.training_usage ? "training (fit) subset" : "train folder"},{" "}
                  <strong>{imbalance.largest[0]}</strong> has <strong>{imbalance.ratio.toFixed(1)}×</strong> as many images
                  as <strong>{imbalance.smallest[0]}</strong> ({imbalance.largest[1].toLocaleString()} vs{" "}
                  {imbalance.smallest[1].toLocaleString()}). An unweighted model sees the majority class far more often, so it
                  tends to over-predict it and can look accurate while missing minority cases.
                </p>
              ) : (
                <p className="text-sm text-slate-500">Not enough classes present to measure imbalance.</p>
              )}
              {report.class_weights ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Balanced class weights</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    As train_model.py computes them from these counts (total ÷ (classes × count)).
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(report.class_weights).map(([label, w]) => (
                      <li key={label} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm tabular-nums dark:bg-slate-800">
                        <span className={cn("font-semibold", CLASS_STYLES[label]?.text)}>{label}</span> {w.toFixed(3)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {report.preprocessing ? (
                <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{report.preprocessing.class_weighting}</p>
              ) : null}
            </Card>
          </div>

          <Card>
            <SectionTitle title="Findings" description="Generated automatically from the statistics above." />
            {report.findings.length === 0 ? (
              <p className="text-sm text-slate-500">No issues detected by the automated checks.</p>
            ) : (
              <ul className="space-y-3">
                {report.findings.map((f) => {
                  const { icon: Icon, className } = FINDING_STYLES[f.severity];
                  return (
                    <li key={f.text} className="flex gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-label={f.severity} />
                      <span>{f.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {report.preprocessing ? (
            <Card>
              <SectionTitle
                title="Preprocessing summary"
                description="Read from the existing training and inference code. Nothing here changes how images are processed."
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Step</th>
                      <th className="py-2 pr-3 font-semibold">Training</th>
                      <th className="py-2 font-semibold">Production inference</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 dark:text-slate-300">
                    {(
                      [
                        ["Loader", report.preprocessing.training_loader, report.preprocessing.inference_loader],
                        ["Input size", `${report.preprocessing.model_input_size}×${report.preprocessing.model_input_size}`, `${report.preprocessing.inference_input_size}×${report.preprocessing.inference_input_size}`],
                        ["Resize interpolation", report.preprocessing.training_resize_interpolation, report.preprocessing.inference_resize_interpolation],
                        ["Colour", report.preprocessing.color_mode, report.preprocessing.color_mode],
                        ["Aspect ratio", report.preprocessing.aspect_ratio_handling, report.preprocessing.aspect_ratio_handling],
                        ["Pixel preprocessing", report.preprocessing.preprocess_function, report.preprocessing.preprocess_function],
                        ["Augmentation", report.preprocessing.augmentation.steps.join("; "), "None"],
                      ] as const
                    ).map(([step, train, infer]) => (
                      <tr key={step} className="border-b border-slate-100 align-top dark:border-slate-800">
                        <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{step}</td>
                        <td className={cn("py-2 pr-3", train !== infer && "font-medium text-amber-800 dark:text-amber-300")}>{train}</td>
                        <td className={cn("py-2", train !== infer && "font-medium text-amber-800 dark:text-amber-300")}>{infer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Augmentation applies to: {report.preprocessing.augmentation.applied_to}. Backbone: {report.preprocessing.backbone}.
              </p>
              {report.preprocessing.differences.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-950/40">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <Layers className="h-4 w-4" aria-hidden /> Training vs inference differences
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950 dark:text-amber-100">
                    {report.preprocessing.differences.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ) : null}

          <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/45 dark:text-amber-100">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="leading-relaxed">
              XRaySense AI is an academic decision-support prototype, not a clinically validated diagnostic system. This
              analysis describes a public research dataset. Report generated {new Date(report.generated_at).toLocaleString()}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
