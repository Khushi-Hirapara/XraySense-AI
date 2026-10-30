import type { PredictionLabel } from "@/lib/types";

export function isAbnormalPrediction(prediction: PredictionLabel | string): boolean {
  return prediction === "Pneumonia" || prediction === "COVID";
}

export interface PredictionCounts {
  total: number;
  normal: number;
  pneumonia: number;
  covid: number;
  avgConfidence: number;
}

export function countPredictions(
  scans: Array<{ prediction: PredictionLabel | string; confidence: number }>,
): PredictionCounts {
  let normal = 0;
  let pneumonia = 0;
  let covid = 0;
  let confidenceSum = 0;

  for (const scan of scans) {
    confidenceSum += scan.confidence;
    if (scan.prediction === "Pneumonia") pneumonia += 1;
    else if (scan.prediction === "COVID") covid += 1;
    else if (scan.prediction === "Normal") normal += 1;
  }

  return {
    total: scans.length,
    normal,
    pneumonia,
    covid,
    avgConfidence: scans.length > 0 ? confidenceSum / scans.length : 0,
  };
}

/** Shared rose/emerald tone classes for abnormal vs normal predictions. */
export function predictionToneClasses(isAbnormal: boolean) {
  return {
    pill: isAbnormal
      ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/40"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/40",
    value: isAbnormal
      ? "text-rose-700 dark:text-rose-300"
      : "text-emerald-700 dark:text-emerald-300",
    bar: isAbnormal
      ? "bg-gradient-to-r from-rose-400 to-rose-600 shadow-[0_0_10px_rgb(244_63_94/0.45)]"
      : "bg-gradient-to-r from-emerald-400 to-teal-500 shadow-[0_0_10px_rgb(20_184_166/0.45)]",
    surface: isAbnormal
      ? "border-rose-200/90 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10"
      : "border-emerald-200/90 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    heading: isAbnormal
      ? "text-rose-800 dark:text-rose-300"
      : "text-emerald-800 dark:text-emerald-300",
  };
}
