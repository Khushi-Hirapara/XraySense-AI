import { parseInfectedPctNumber } from "@/lib/affected-area";
import type { PredictionLabel, ScanRecord, SeverityLabel } from "@/lib/types";

export const SEVERITY_RANK: Record<SeverityLabel, number> = {
  None: 0,
  Mild: 1,
  Moderate: 2,
  Severe: 3,
};

export function severityRank(severity: SeverityLabel): number {
  return SEVERITY_RANK[severity] ?? 0;
}

export type ComparisonTrend = "improved" | "worsened" | "stable";

export type OpacityChangeLabel =
  | "Opacity Reduced"
  | "Opacity Increased"
  | "Opacity Unchanged"
  | "Opacity not quantified";

export interface ScanComparisonResult {
  earlier: ScanRecord;
  later: ScanRecord;
  /** Positive = clinical improvement; negative = worsening. */
  improvementPct: number;
  trend: ComparisonTrend;
  trendLabel: string;
  opacityLabel: OpacityChangeLabel;
  opacityEarlierPct: number | null;
  opacityLaterPct: number | null;
  severityFrom: SeverityLabel;
  severityTo: SeverityLabel;
  severityChanged: boolean;
  predictionFrom: PredictionLabel;
  predictionTo: PredictionLabel;
  predictionChanged: boolean;
  confidenceDeltaPctPoints: number;
  summary: string;
}

function chronologicalPair(
  a: ScanRecord,
  b: ScanRecord,
): { earlier: ScanRecord; later: ScanRecord } {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime <= bTime) return { earlier: a, later: b };
  return { earlier: b, later: a };
}

function computeOpacityLabel(
  earlierPct: number | null,
  laterPct: number | null,
): OpacityChangeLabel {
  if (earlierPct === null || laterPct === null) {
    return "Opacity not quantified";
  }
  const delta = laterPct - earlierPct;
  if (delta <= -2) return "Opacity Reduced";
  if (delta >= 2) return "Opacity Increased";
  return "Opacity Unchanged";
}

function computeImprovementPct(
  earlier: ScanRecord,
  later: ScanRecord,
  earlierOpacity: number | null,
  laterOpacity: number | null,
): number {
  const scores: number[] = [];

  const sevDelta = severityRank(earlier.severity) - severityRank(later.severity);
  scores.push((sevDelta / 3) * 100);

  if (earlierOpacity !== null && laterOpacity !== null) {
    const baseline = Math.max(earlierOpacity, 1);
    scores.push(((earlierOpacity - laterOpacity) / baseline) * 100);
  }

  // Clearing pneumonia is a strong positive signal.
  if (earlier.prediction === "Pneumonia" && later.prediction === "Normal") {
    scores.push(70);
  } else if (earlier.prediction === "Normal" && later.prediction === "Pneumonia") {
    scores.push(-70);
  }

  // Confidence drop on pneumonia (or rise on normal) as a soft signal.
  if (earlier.prediction === "Pneumonia" && later.prediction === "Pneumonia") {
    scores.push((earlier.confidence - later.confidence) * 40);
  }

  if (scores.length === 0) return 0;
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Math.round(Math.max(-100, Math.min(100, avg)));
}

function buildSummary(result: Omit<ScanComparisonResult, "summary">): string {
  if (result.trend === "improved") {
    return `Screening signals improved by about ${result.improvementPct}% between the selected studies.`;
  }
  if (result.trend === "worsened") {
    return `Screening signals worsened by about ${Math.abs(result.improvementPct)}% between the selected studies.`;
  }
  return "Screening signals appear broadly stable between the selected studies.";
}

/** Compare two scans of the same patient (order-independent; older is baseline). */
export function compareScans(scanA: ScanRecord, scanB: ScanRecord): ScanComparisonResult {
  if (scanA.id === scanB.id) {
    throw new Error("Select two different scans to compare.");
  }

  const { earlier, later } = chronologicalPair(scanA, scanB);
  const opacityEarlierPct = parseInfectedPctNumber(earlier.observedRegions);
  const opacityLaterPct = parseInfectedPctNumber(later.observedRegions);
  const improvementPct = computeImprovementPct(
    earlier,
    later,
    opacityEarlierPct,
    opacityLaterPct,
  );

  let trend: ComparisonTrend = "stable";
  if (improvementPct >= 5) trend = "improved";
  else if (improvementPct <= -5) trend = "worsened";

  const trendLabel =
    trend === "improved"
      ? `Improvement: ${improvementPct}%`
      : trend === "worsened"
        ? `Worsening: ${Math.abs(improvementPct)}%`
        : "Stable";

  const partial = {
    earlier,
    later,
    improvementPct,
    trend,
    trendLabel,
    opacityLabel: computeOpacityLabel(opacityEarlierPct, opacityLaterPct),
    opacityEarlierPct,
    opacityLaterPct,
    severityFrom: earlier.severity,
    severityTo: later.severity,
    severityChanged: earlier.severity !== later.severity,
    predictionFrom: earlier.prediction,
    predictionTo: later.prediction,
    predictionChanged: earlier.prediction !== later.prediction,
    confidenceDeltaPctPoints: Math.round((later.confidence - earlier.confidence) * 1000) / 10,
  };

  return { ...partial, summary: buildSummary(partial) };
}

export function formatScanOptionLabel(scan: ScanRecord): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(scan.createdAt));
  return `${date} — ${scan.prediction} (${scan.severity})`;
}

export function formatScanDateHeading(scan: ScanRecord): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(scan.createdAt));
  return `Scan (${date})`;
}

/** Default pair: second-most-recent (baseline) and most-recent (follow-up). */
export function defaultComparisonPair(
  scans: ScanRecord[],
): { baselineId: string; followUpId: string } | null {
  if (scans.length < 2) return null;
  const ordered = [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const baseline = ordered[ordered.length - 2];
  const followUp = ordered[ordered.length - 1];
  if (!baseline || !followUp) return null;
  return { baselineId: baseline.id, followUpId: followUp.id };
}

/**
 * Resolve a valid baseline/follow-up pair, honoring optional preferred ids.
 * Ensures the two selected scans are always different.
 */
export function resolveComparisonPair(
  scans: ScanRecord[],
  preferred?: { baselineId?: string; followUpId?: string },
): { baselineId: string; followUpId: string } | null {
  const defaults = defaultComparisonPair(scans);
  if (!defaults) return null;

  const has = (id?: string) => Boolean(id && scans.some((s) => s.id === id));
  let baselineId = has(preferred?.baselineId)
    ? (preferred?.baselineId as string)
    : defaults.baselineId;
  let followUpId = has(preferred?.followUpId)
    ? (preferred?.followUpId as string)
    : defaults.followUpId;

  if (baselineId !== followUpId) {
    return { baselineId, followUpId };
  }

  const ordered = [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const idx = ordered.findIndex((s) => s.id === followUpId);
  if (idx > 0) {
    baselineId = ordered[idx - 1]!.id;
    return { baselineId, followUpId };
  }
  if (idx >= 0 && idx < ordered.length - 1) {
    baselineId = followUpId;
    followUpId = ordered[idx + 1]!.id;
    return { baselineId, followUpId };
  }

  return defaults;
}
