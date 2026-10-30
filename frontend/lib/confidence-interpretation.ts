import type { PredictionLabel } from "@/lib/types";

export type ConfidenceTier = "Very high" | "High" | "Moderate" | "Low";

export interface ConfidenceInterpretation {
  tier: ConfidenceTier;
  pct: number;
  headline: string;
  explanation: string;
  disclaimer: string;
}

export function getConfidenceTier(pct: number): ConfidenceTier {
  if (pct >= 90) return "Very high";
  if (pct >= 75) return "High";
  if (pct >= 60) return "Moderate";
  return "Low";
}

export function tierAccentClass(tier: ConfidenceTier): string {
  switch (tier) {
    case "Very high":
      return "text-emerald-700";
    case "High":
      return "text-teal-700";
    case "Moderate":
      return "text-amber-700";
    case "Low":
      return "text-orange-700";
  }
}

export function tierGaugeClass(tier: ConfidenceTier): string {
  switch (tier) {
    case "Very high":
      return "stroke-emerald-500";
    case "High":
      return "stroke-teal-500";
    case "Moderate":
      return "stroke-amber-500";
    case "Low":
      return "stroke-orange-500";
  }
}

/** Clinician-facing explanation of model confidence (certainty, not severity). */
export function interpretModelConfidence(
  confidenceFraction: number,
  prediction: PredictionLabel,
): ConfidenceInterpretation {
  const pct = Math.round(confidenceFraction * 1000) / 10;
  const tier = getConfidenceTier(pct);
  const isPneumonia = prediction === "Pneumonia";
  const isCovid = prediction === "COVID";

  const tierLabel = tier === "Very high" ? "Very High Confidence" : `${tier} Confidence`;

  let explanation: string;
  if (isPneumonia) {
    if (tier === "Very high" || tier === "High") {
      explanation =
        "The model strongly believes this image represents pneumonia.";
    } else if (tier === "Moderate") {
      explanation =
        "The model leans toward pneumonia, but with moderate certainty.";
    } else {
      explanation =
        "The model suggests pneumonia, but confidence is limited—clinical review is especially important.";
    }
  } else if (isCovid) {
    if (tier === "Very high" || tier === "High") {
      explanation =
        "The model strongly believes this image represents a COVID-19–related pattern.";
    } else if (tier === "Moderate") {
      explanation =
        "The model leans toward a COVID-19–related pattern, but with moderate certainty.";
    } else {
      explanation =
        "The model suggests COVID-19–related findings, but confidence is limited—clinical review is especially important.";
    }
  } else if (tier === "Very high" || tier === "High") {
    explanation =
      "The model strongly believes this image does not show a pneumonia or COVID pattern.";
  } else if (tier === "Moderate") {
    explanation =
      "The model leans toward a normal study, but with moderate certainty.";
  } else {
    explanation =
      "The model did not detect pneumonia or COVID with high certainty—other pathology may still be present.";
  }

  return {
    tier,
    pct,
    headline: tierLabel,
    explanation,
    disclaimer:
      "This score reflects the model's certainty in its classification, not the severity of disease.",
  };
}
