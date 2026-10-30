import type { AnalysisResult, ReportRecord, ScanRecord } from "./types";

export const dummyScans: ScanRecord[] = [
  {
    id: "scan-001",
    patientName: "Maria Chen",
    prediction: "Pneumonia",
    confidence: 0.92,
    severity: "Severe",
    observedRegions:
      "Right Lung\nLower Lobe\nApproximate infected region: 38%",
    aiFindings:
      "Pattern is consistent with possible bacterial pneumonia. Clinical correlation is recommended.",
    followUpRecommendation: "Consult radiologist.\nRepeat X-ray after treatment.",
    recommendation:
      "Findings suggest possible pneumonia. Correlate with clinical symptoms and consider follow-up imaging or laboratory workup.",
    createdAt: "2026-05-28T14:32:00Z",
    imagePath: "/placeholder-xray.svg",
    heatmapPath: "/placeholder-heatmap.svg",
    modelVersion: "demo",
  },
  {
    id: "scan-002",
    patientName: "James Okonkwo",
    prediction: "Normal",
    confidence: 0.88,
    severity: "None",
    observedRegions: "No significant opacity regions identified",
    aiFindings:
      "No pneumonia-like opacity pattern was identified on this chest X-ray screening.",
    followUpRecommendation:
      "Continue routine health monitoring.\nConsult a healthcare professional if symptoms persist.",
    recommendation:
      "No strong radiographic indicators of pneumonia. Continue routine care unless clinical presentation suggests otherwise.",
    createdAt: "2026-05-27T09:15:00Z",
    imagePath: "/placeholder-xray.svg",
    modelVersion: "demo",
  },
  {
    id: "scan-003",
    patientName: "Elena Vasquez",
    prediction: "Pneumonia",
    confidence: 0.79,
    severity: "Moderate",
    observedRegions:
      "Left Lung\nMiddle Lobe\nApproximate infected region: 24%",
    aiFindings:
      "Pattern is consistent with possible bacterial pneumonia. Clinical correlation is recommended.",
    followUpRecommendation: "Consult radiologist.\nRepeat X-ray after treatment.",
    recommendation:
      "Moderate-confidence pneumonia pattern. Recommend physician review and possible additional diagnostic testing.",
    createdAt: "2026-05-25T16:48:00Z",
    imagePath: "/placeholder-xray.svg",
    heatmapPath: "/placeholder-heatmap.svg",
    modelVersion: "demo",
  },
  {
    id: "scan-004",
    patientName: "Robert Singh",
    prediction: "Normal",
    confidence: 0.94,
    severity: "None",
    observedRegions: "No significant opacity regions identified",
    aiFindings:
      "No pneumonia-like opacity pattern was identified on this chest X-ray screening.",
    followUpRecommendation:
      "Continue routine health monitoring.\nConsult a healthcare professional if symptoms persist.",
    recommendation:
      "Chest X-ray appears within normal limits for pneumonia screening. Document and monitor per protocol.",
    createdAt: "2026-05-24T11:02:00Z",
    imagePath: "/placeholder-xray.svg",
    modelVersion: "demo",
  },
];

export const dummyReports: ReportRecord[] = [
  {
    id: "report-001",
    scanId: "scan-001",
    patientName: "Maria Chen",
    prediction: "Pneumonia",
    confidence: 0.92,
    generatedAt: "2026-05-28T14:35:00Z",
    summary:
      "AI-assisted analysis detected radiographic patterns consistent with pneumonia with high confidence.",
    recommendation:
      "Findings suggest possible pneumonia. Correlate with clinical symptoms and consider follow-up imaging or laboratory workup.",
    physicianNote:
      "Grad-CAM highlights increased attention in the lower right lung field. This report is for decision support only.",
  },
  {
    id: "report-002",
    scanId: "scan-002",
    patientName: "James Okonkwo",
    prediction: "Normal",
    confidence: 0.88,
    generatedAt: "2026-05-27T09:18:00Z",
    summary:
      "No significant pneumonia-indicative features were identified on this chest radiograph.",
    recommendation:
      "No strong radiographic indicators of pneumonia. Continue routine care unless clinical presentation suggests otherwise.",
    physicianNote:
      "Model confidence is high for a normal classification. Clinical judgment remains essential.",
  },
  {
    id: "report-003",
    scanId: "scan-003",
    patientName: "Elena Vasquez",
    prediction: "Pneumonia",
    confidence: 0.79,
    generatedAt: "2026-05-25T16:52:00Z",
    summary:
      "Moderate-confidence pneumonia detection with localized activation on Grad-CAM overlay.",
    recommendation:
      "Moderate-confidence pneumonia pattern. Recommend physician review and possible additional diagnostic testing.",
    physicianNote:
      "Review recommended due to borderline confidence. Compare with prior studies if available.",
  },
];

export const platformStats = {
  totalScans: 1284,
  pneumoniaDetected: 412,
  avgConfidence: 0.89,
  reportsGenerated: 956,
};

/** Simulated inference result (history/demo pages). */
export function getDummyAnalysisResult(): AnalysisResult {
  return {
    prediction: "Pneumonia",
    confidence: 0.87,
    severity: "Moderate",
    observedRegions:
      "Right Lung\nLower Lobe\nApproximate infected region: 23%",
    aiFindings:
      "Pattern is consistent with possible bacterial pneumonia. Clinical correlation is recommended.",
    followUpRecommendation: "Consult radiologist.\nRepeat X-ray after treatment.",
    recommendation:
      "AI screening suggests patterns that may be consistent with pneumonia. Please correlate with clinical symptoms, vital signs, and laboratory findings. Consider follow-up imaging or specialist consultation if clinically indicated. This output is decision-support only—not a definitive diagnosis.",
    imageUrl: "/placeholder-xray.svg",
    heatmapUrl: "/placeholder-heatmap.svg",
  };
}

export const dummyAnalysisResult: ScanRecord = {
  id: "scan-preview",
  patientName: "Demo Patient",
  prediction: "Pneumonia",
  confidence: 0.87,
  severity: "Moderate",
  observedRegions:
    "Right Lung\nLower Lobe\nApproximate infected region: 23%",
  aiFindings:
    "Pattern is consistent with possible bacterial pneumonia. Clinical correlation is recommended.",
  followUpRecommendation: "Consult radiologist.\nRepeat X-ray after treatment.",
  recommendation:
    "Preliminary AI analysis suggests pneumonia. This is simulated data—connect the backend for live inference.",
  createdAt: new Date().toISOString(),
  imagePath: "/placeholder-xray.svg",
  heatmapPath: "/placeholder-heatmap.svg",
  modelVersion: "demo",
};
