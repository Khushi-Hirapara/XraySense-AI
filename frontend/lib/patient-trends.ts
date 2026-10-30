import { parseInfectedPctNumber } from "@/lib/affected-area";
import { severityRank } from "@/lib/scan-comparison";
import type { ScanRecord, SeverityLabel } from "@/lib/types";

export interface TrendPoint {
  scanId: string;
  date: string;
  label: string;
  severity: SeverityLabel;
  severityScore: number;
  confidencePct: number;
  prediction: ScanRecord["prediction"];
  infectedPct: number | null;
}

export interface FrequencyBucket {
  key: string;
  label: string;
  count: number;
}

export interface RecoveryEvent {
  scanId: string;
  date: string;
  label: string;
  title: string;
  detail: string;
  kind: "improved" | "worsened" | "stable" | "milestone";
}

export interface PatientTrendSummary {
  totalScans: number;
  pneumoniaScans: number;
  covidScans: number;
  normalScans: number;
  pneumoniaRatePct: number;
  averageConfidencePct: number;
  latestSeverity: SeverityLabel | null;
  severityProgressionLabel: string;
  recoveryTimelineLabel: string;
  firstScanAt: string | null;
  lastScanAt: string | null;
}

export interface PatientTrendData {
  summary: PatientTrendSummary;
  series: TrendPoint[];
  frequency: FrequencyBucket[];
  recoveryEvents: RecoveryEvent[];
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function chronological(scans: ScanRecord[]): ScanRecord[] {
  return [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function severityProgressionLabel(series: TrendPoint[]): string {
  if (series.length === 0) return "No scans yet";
  if (series.length === 1) {
    return `Current: ${series[0]!.severity}`;
  }
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (first.severity === last.severity) {
    return `Stable at ${last.severity}`;
  }
  return `${first.severity} → ${last.severity}`;
}

function recoveryTimelineLabel(series: TrendPoint[]): string {
  if (series.length < 2) return "Need 2+ scans";
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const delta = first.severityScore - last.severityScore;

  if (first.prediction !== "Normal" && last.prediction === "Normal") {
    return "Cleared abnormal pattern";
  }
  if (delta > 0) return "Improving trajectory";
  if (delta < 0) return "Worsening trajectory";
  return "Stable trajectory";
}

function buildFrequency(series: TrendPoint[]): FrequencyBucket[] {
  const counts = new Map<string, number>();
  for (const point of series) {
    const key = monthKey(point.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      key,
      label: monthLabel(key),
      count,
    }));
}

function buildRecoveryEvents(series: TrendPoint[]): RecoveryEvent[] {
  if (series.length === 0) return [];

  const events: RecoveryEvent[] = [
    {
      scanId: series[0]!.scanId,
      date: series[0]!.date,
      label: series[0]!.label,
      title: "Baseline study",
      detail: `${series[0]!.prediction} · ${series[0]!.severity} · ${series[0]!.confidencePct.toFixed(0)}% confidence`,
      kind: "milestone",
    },
  ];

  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1]!;
    const curr = series[i]!;
    const sevDelta = prev.severityScore - curr.severityScore;

    let kind: RecoveryEvent["kind"] = "stable";
    let title = "Follow-up study";
    let detail = `${curr.prediction} · ${curr.severity}`;

    if (prev.prediction !== "Normal" && curr.prediction === "Normal") {
      kind = "improved";
      title = `${prev.prediction} pattern cleared`;
      detail = `Severity ${prev.severity} → ${curr.severity}`;
    } else if (prev.prediction === "Normal" && curr.prediction !== "Normal") {
      kind = "worsened";
      title = `${curr.prediction} pattern detected`;
      detail = `Severity ${prev.severity} → ${curr.severity}`;
    } else if (sevDelta > 0) {
      kind = "improved";
      title = "Severity improved";
      detail = `${prev.severity} → ${curr.severity}`;
    } else if (sevDelta < 0) {
      kind = "worsened";
      title = "Severity increased";
      detail = `${prev.severity} → ${curr.severity}`;
    } else {
      detail = `Severity held at ${curr.severity}`;
    }

    if (
      prev.infectedPct !== null &&
      curr.infectedPct !== null &&
      curr.infectedPct <= prev.infectedPct - 5
    ) {
      detail += ` · Opacity ${prev.infectedPct}% → ${curr.infectedPct}%`;
    }

    events.push({
      scanId: curr.scanId,
      date: curr.date,
      label: curr.label,
      title,
      detail,
      kind,
    });
  }

  return events;
}

/** Build dashboard metrics and chart series from a patient's scans. */
export function buildPatientTrendData(scans: ScanRecord[]): PatientTrendData {
  const ordered = chronological(scans);
  const series: TrendPoint[] = ordered.map((scan) => ({
    scanId: scan.id,
    date: scan.createdAt,
    label: shortDate(scan.createdAt),
    severity: scan.severity,
    severityScore: severityRank(scan.severity),
    confidencePct: Math.round(scan.confidence * 1000) / 10,
    prediction: scan.prediction,
    infectedPct: parseInfectedPctNumber(scan.observedRegions),
  }));

  const pneumoniaScans = ordered.filter((s) => s.prediction === "Pneumonia").length;
  const covidScans = ordered.filter((s) => s.prediction === "COVID").length;
  const normalScans = ordered.filter((s) => s.prediction === "Normal").length;
  const avgConfidence =
    ordered.length === 0
      ? 0
      : ordered.reduce((sum, s) => sum + s.confidence, 0) / ordered.length;

  const summary: PatientTrendSummary = {
    totalScans: ordered.length,
    pneumoniaScans,
    covidScans,
    normalScans,
    pneumoniaRatePct:
      ordered.length === 0
        ? 0
        : Math.round(((pneumoniaScans + covidScans) / ordered.length) * 100),
    averageConfidencePct: Math.round(avgConfidence * 1000) / 10,
    latestSeverity: series[series.length - 1]?.severity ?? null,
    severityProgressionLabel: severityProgressionLabel(series),
    recoveryTimelineLabel: recoveryTimelineLabel(series),
    firstScanAt: series[0]?.date ?? null,
    lastScanAt: series[series.length - 1]?.date ?? null,
  };

  return {
    summary,
    series,
    frequency: buildFrequency(series),
    recoveryEvents: buildRecoveryEvents(series),
  };
}
