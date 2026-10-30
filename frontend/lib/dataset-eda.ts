/**
 * Aggregate dataset EDA report (doctor-only). Shapes mirror
 * backend/app/schemas/dataset_eda.py; field names are kept as returned.
 */

import { apiFetch } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/api";

export interface DistributionStats {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
}

export interface Histogram {
  bin_edges: number[];
  counts: Record<string, number[]>;
}

export interface SplitSummary {
  split: string;
  exists: boolean;
  class_counts: Record<string, number>;
  class_percentages: Record<string, number | null>;
  total: number;
  non_image_files: number;
}

export interface DominantSize {
  width: number;
  height: number;
  count: number;
  share: number;
  distinct_sizes: number;
  share_in_other_classes: number;
}

export interface DatasetSample {
  id: string;
  label: string;
  split: string;
  width: number;
  height: number;
}

export interface DatasetFinding {
  severity: "error" | "warning" | "info";
  text: string;
}

export interface DatasetEdaReport {
  schema_version: number;
  generated_at: string;
  dataset_root: string;
  class_names: string[];
  label_mapping: Record<string, number> | null;
  overall: {
    total: number;
    class_counts: Record<string, number>;
    class_percentages: Record<string, number | null>;
  };
  splits: SplitSummary[];
  training_usage: {
    description: string;
    fit: Record<string, number>;
    validation: Record<string, number>;
    unused_splits: string[];
  } | null;
  image_properties: {
    measured_images: number;
    width: Record<string, DistributionStats | null>;
    height: Record<string, DistributionStats | null>;
    aspect_ratio: Record<string, DistributionStats | null>;
    width_histogram: Histogram | null;
    height_histogram: Histogram | null;
    color_modes_by_class: Record<string, Record<string, number>>;
    formats_by_class: Record<string, Record<string, number>>;
    dominant_size_by_class: Record<string, DominantSize | null>;
  };
  quality: {
    missing_folders: string[];
    empty_folders: string[];
    unreadable: { count: number; by_folder: Record<string, number>; error_types: Record<string, number> };
    duplicates: {
      method: string;
      duplicate_groups: number;
      redundant_copies: number;
      groups_spanning_splits: Record<string, number>;
      groups_with_conflicting_labels: number;
    };
    dimension_issues: {
      min_dimension: number;
      below_min_dimension: number;
      extreme_aspect_ratio: number;
      non_rgb_or_grayscale: number;
    };
  };
  class_weights: Record<string, number> | null;
  preprocessing: {
    model_input_size: number;
    inference_input_size: number;
    backbone: string;
    preprocess_function: string;
    color_mode: string;
    aspect_ratio_handling: string;
    training_loader: string;
    training_resize_interpolation: string;
    inference_loader: string;
    inference_resize_interpolation: string;
    augmentation: { applied_to: string; steps: string[] };
    class_weighting: string;
    differences: string[];
  } | null;
  samples: DatasetSample[];
  findings: DatasetFinding[];
}

export interface DatasetEdaResponse {
  report: DatasetEdaReport;
  dataset_available: boolean;
  dataset_matches_report: boolean | null;
}

export class DatasetEdaError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DatasetEdaError";
    this.status = status;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // fall through to the generic message
  }
  return `Request failed (${response.status})`;
}

export async function fetchDatasetEda(): Promise<DatasetEdaResponse> {
  const response = await apiFetch(`${getApiBaseUrl()}/dataset-eda/report`, { cache: "no-store" });
  if (!response.ok) {
    throw new DatasetEdaError(await errorMessage(response), response.status);
  }
  return (await response.json()) as DatasetEdaResponse;
}

/** Sample thumbnails need the Bearer token, so they are fetched as blobs. Caller revokes the URL. */
export async function fetchDatasetSampleUrl(sampleId: string): Promise<string> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/dataset-eda/samples/${encodeURIComponent(sampleId)}`,
  );
  if (!response.ok) {
    throw new DatasetEdaError(await errorMessage(response), response.status);
  }
  return URL.createObjectURL(await response.blob());
}

/** Order used by every chart: NORMAL, PNEUMONIA, COVID (the model's label order). */
export const CLASS_STYLES: Record<string, { bar: string; fill: string; text: string }> = {
  NORMAL: { bar: "bg-emerald-500", fill: "fill-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  PNEUMONIA: { bar: "bg-rose-500", fill: "fill-rose-500", text: "text-rose-700 dark:text-rose-400" },
  COVID: { bar: "bg-amber-500", fill: "fill-amber-500", text: "text-amber-700 dark:text-amber-400" },
};

export const FALLBACK_CLASS_STYLE = { bar: "bg-slate-400", fill: "fill-slate-400", text: "text-slate-700" };

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
