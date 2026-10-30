export type PredictionLabel = "Pneumonia" | "Normal" | "COVID";

export type SeverityLabel = "None" | "Mild" | "Moderate" | "Severe";

export type UserRole = "doctor" | "patient";

/** Key DICOM tags preserved from a source study (snake_case from API). */
export interface DicomMetadata {
  patient_name?: string | null;
  patient_id?: string | null;
  patient_sex?: string | null;
  patient_age?: string | null;
  study_date?: string | null;
  study_time?: string | null;
  study_description?: string | null;
  series_description?: string | null;
  modality?: string | null;
  body_part_examined?: string | null;
  institution_name?: string | null;
  manufacturer?: string | null;
  rows?: number | null;
  columns?: number | null;
  photometric_interpretation?: string | null;
  transfer_syntax_uid?: string | null;
  source_format?: string | null;
  converted_png?: string | null;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  emailVerifiedAt?: string | null;
}

export interface DoctorDashboardStats {
  totalPatients: number;
  totalScans: number;
  normalScans: number;
  pneumoniaScans: number;
  covidScans: number;
  averageConfidence: number | null;
  recentScans: ScanRecord[];
}

export interface PatientDashboardStats {
  totalScans: number;
  normalScans: number;
  pneumoniaScans: number;
  covidScans: number;
  averageConfidence: number | null;
  lastScanResult: PredictionLabel | null;
  lastScanDate: string | null;
}

export interface AnalysisResult {
  scanId?: number;
  prediction: PredictionLabel;
  /** Model confidence as a fraction (0–1). */
  confidence: number;
  severity: SeverityLabel;
  observedRegions: string;
  aiFindings: string;
  followUpRecommendation: string;
  recommendation: string;
  /** URL of the image stored on the backend. */
  imageUrl: string;
  /** Grad-CAM heatmap URL when available. */
  heatmapUrl?: string;
  /** Original DICOM download URL when the source study was DICOM. */
  originalUrl?: string;
  dicomMetadata?: DicomMetadata | null;
  modelVersion?: string;
}

export interface ScanRecord {
  id: string;
  patientId?: number;
  patientName: string;
  prediction: PredictionLabel;
  confidence: number;
  severity: SeverityLabel;
  observedRegions: string;
  aiFindings: string;
  followUpRecommendation: string;
  recommendation: string;
  createdAt: string;
  imagePath: string;
  heatmapPath?: string;
  originalPath?: string;
  dicomMetadata?: DicomMetadata | null;
  modelVersion: string | null;
}

export interface ScanNoteRecord {
  id: number;
  scanId: number;
  doctorId: number;
  noteText: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRecord {
  id: string;
  scanId: string;
  patientName: string;
  prediction: PredictionLabel;
  confidence: number;
  generatedAt: string;
  summary: string;
  recommendation: string;
  physicianNote: string;
}
