/**
 * Aggregate model evaluation report (doctor-only). Shapes mirror
 * backend/app/schemas/model_evaluation.py; field names are kept as returned.
 */

import { apiFetch } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/api";

export interface BinaryMetrics {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  f1: number | null;
}

export interface ThresholdRow extends BinaryMetrics {
  threshold: number;
}

export interface ClassReportRow {
  label: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number;
  predicted_count: number;
}

export interface AveragedMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface ClassificationReport {
  classes: ClassReportRow[];
  accuracy: number | null;
  macro_avg: AveragedMetrics;
  weighted_avg: AveragedMetrics;
  total_support: number;
}

export interface OperatingPoint {
  id: string;
  label: string;
  decision_rule: string;
  threshold: number | null;
  dataset: string;
  metrics: BinaryMetrics;
  confusion_matrix: { labels: string[]; matrix: number[][] };
  classification_report: ClassificationReport;
}

export interface DatasetSummary {
  source: string;
  class_counts: Record<string, number>;
  total: number;
  invalid_predictions_excluded: number;
  binary_task_total: number;
}

export interface EvaluationReport {
  schema_version: number;
  generated_at: string;
  model: {
    file_name: string;
    sha256: string;
    size_bytes: number;
    version_label: string;
    architecture: string;
  };
  preprocessing: { description: string; image_size: number };
  label_mapping: Record<string, number>;
  production_decision: {
    rule: string;
    classes: string[];
    description: string;
    probability_threshold: number | null;
  };
  positive_class: string;
  negative_class: string;
  score_definition: string;
  datasets: { test: DatasetSummary; validation: DatasetSummary };
  binary_task: {
    description: string;
    included_classes: string[];
    excluded_classes: string[];
    included_samples: number;
    excluded_samples: number;
    argmax_predicted_covid: number;
  };
  threshold_selection: {
    method: string;
    dataset: string;
    selected_threshold: number | null;
    youden_j: number | null;
    validation_metrics: ThresholdRow | null;
    production_rule: string;
  };
  operating_points: OperatingPoint[];
  curves: {
    dataset: string;
    roc: { auc: number; points: { fpr: number; tpr: number }[] } | null;
    precision_recall: {
      average_precision: number;
      prevalence: number;
      points: { recall: number; precision: number }[];
    } | null;
  };
  threshold_sweep: { dataset: string; note: string; rows: ThresholdRow[] };
  multiclass: {
    dataset: string;
    decision_rule: string;
    /** Row (actual) and column (predicted) order. */
    labels: string[];
    total: number;
    confusion_matrix: number[][];
    classification_report: ClassificationReport;
    roc_auc_ovr: {
      method: string;
      per_class: Record<string, number | null>;
      macro: number | null;
      weighted: number | null;
      note: string | null;
    };
    roc_curves_ovr: { label: string; auc: number; points: { fpr: number; tpr: number }[] }[];
  };
  interpretation: { strengths: string[]; limitations: string[]; binary_notes: string[] };
}

export interface ModelEvaluationResponse {
  report: EvaluationReport;
  model_matches_report: boolean | null;
  deployed_model_version: string;
}

export class ModelEvaluationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ModelEvaluationError";
    this.status = status;
  }
}

export async function fetchModelEvaluation(): Promise<ModelEvaluationResponse> {
  const response = await apiFetch(`${getApiBaseUrl()}/model-evaluation/report`, {
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the generic message
    }
    throw new ModelEvaluationError(message, response.status);
  }
  return (await response.json()) as ModelEvaluationResponse;
}

/** Percentage with one decimal; undefined metrics render as an em dash. */
export function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatThreshold(point: Pick<OperatingPoint, "threshold">): string {
  return point.threshold === null ? "argmax" : point.threshold.toFixed(2);
}
