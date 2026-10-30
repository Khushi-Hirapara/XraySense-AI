/**
 * REST client for the local CareVision FastAPI backend.
 * Configure via NEXT_PUBLIC_API_BASE_URL (default http://localhost:8000).
 */

import { apiFetch } from "@/lib/api-client";
import type {
  AnalysisResult,
  DicomMetadata,
  DoctorDashboardStats,
  PatientDashboardStats,
  PredictionLabel,
  SeverityLabel,
  ScanNoteRecord,
  ScanRecord,
} from "@/lib/types";

const DEFAULT_API_BASE = "http://localhost:8000";

export interface PredictApiResponse {
  scan_id: number;
  prediction: PredictionLabel;
  confidence: number;
  severity: SeverityLabel;
  observed_regions: string;
  ai_findings: string;
  follow_up_recommendation: string;
  recommendation: string;
  image_path: string;
  heatmap_path: string | null;
  original_path?: string | null;
  dicom_metadata?: DicomMetadata | null;
  model_version: string;
}

export interface ScanApiResponse {
  id: number;
  user_id: number;
  patient_id?: number | null;
  patient_name: string;
  image_path: string;
  heatmap_path: string | null;
  original_path?: string | null;
  dicom_metadata?: DicomMetadata | null;
  prediction: PredictionLabel;
  confidence: number;
  severity: SeverityLabel;
  observed_regions: string;
  ai_findings: string;
  follow_up_recommendation: string;
  recommendation: string | null;
  model_version: string | null;
  created_at: string;
}

export interface ScanListApiResponse {
  items: ScanApiResponse[];
  total: number;
}

export class PredictApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PredictApiError";
    this.status = status;
  }
}

/** Backend origin (strips a trailing `/api/v1` if present). */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  return raw.replace(/\/api\/v1\/?$/i, "").replace(/\/$/, "");
}

/**
 * Host used to start Google/Microsoft OAuth.
 * Must match the public callback host (e.g. ngrok) when redirect URIs are not localhost.
 * Falls back to the normal API base URL.
 */
export function getSsoBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SSO_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    DEFAULT_API_BASE;
  return raw.replace(/\/api\/v1\/?$/i, "").replace(/\/$/, "");
}

/** Turn a storage path from the API into a fetchable URL served at /uploads/. */
export function apiAssetUrl(storagePath: string): string {
  const normalized = storagePath.replace(/\\/g, "/");
  const relative = normalized.match(/uploads\/(.+)$/i)?.[1];
  if (relative) {
    return `${getApiBaseUrl()}/uploads/${relative}`;
  }
  const filename = normalized.split("/").pop();
  if (filename) {
    return `${getApiBaseUrl()}/uploads/${filename}`;
  }
  return `${getApiBaseUrl()}/${normalized.replace(/^\/+/, "")}`;
}

function mapPredictResponse(data: PredictApiResponse): AnalysisResult {
  const heatmapUrl =
    data.heatmap_path && data.heatmap_path !== data.image_path
      ? apiAssetUrl(data.heatmap_path)
      : undefined;

  return {
    scanId: data.scan_id,
    prediction: data.prediction,
    confidence: data.confidence / 100,
    severity: data.severity,
    observedRegions: data.observed_regions,
    aiFindings: data.ai_findings,
    followUpRecommendation: data.follow_up_recommendation,
    recommendation: data.recommendation,
    imageUrl: apiAssetUrl(data.image_path),
    heatmapUrl,
    originalUrl: data.original_path ? apiAssetUrl(data.original_path) : undefined,
    dicomMetadata: data.dicom_metadata ?? null,
    modelVersion: data.model_version,
  };
}

export function mapScanResponse(scan: ScanApiResponse): ScanRecord {
  return {
    id: String(scan.id),
    patientId: scan.patient_id ?? undefined,
    patientName: scan.patient_name,
    prediction: scan.prediction,
    confidence: scan.confidence,
    severity: scan.severity ?? "None",
    observedRegions: scan.observed_regions ?? "",
    aiFindings: scan.ai_findings ?? "",
    followUpRecommendation: scan.follow_up_recommendation ?? "",
    recommendation: scan.recommendation ?? "",
    createdAt: scan.created_at,
    imagePath: apiAssetUrl(scan.image_path),
    heatmapPath: scan.heatmap_path ? apiAssetUrl(scan.heatmap_path) : undefined,
    originalPath: scan.original_path ? apiAssetUrl(scan.original_path) : undefined,
    dicomMetadata: scan.dicom_metadata ?? null,
    modelVersion: scan.model_version,
  };
}

export interface DoctorDashboardApiResponse {
  total_patients: number;
  total_scans: number;
  normal_scans: number;
  pneumonia_scans: number;
  covid_scans: number;
  average_confidence: number | null;
  recent_scans: ScanApiResponse[];
}

export interface PatientDashboardApiResponse {
  total_scans: number;
  normal_scans: number;
  pneumonia_scans: number;
  covid_scans: number;
  average_confidence: number | null;
  last_scan_result: PredictionLabel | null;
  last_scan_date: string | null;
}

export async function fetchDoctorDashboardStats(): Promise<DoctorDashboardStats> {
  const response = await apiFetch(`${getApiBaseUrl()}/dashboard/doctor-stats`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as DoctorDashboardApiResponse;
  return {
    totalPatients: data.total_patients,
    totalScans: data.total_scans,
    normalScans: data.normal_scans,
    pneumoniaScans: data.pneumonia_scans,
    covidScans: data.covid_scans ?? 0,
    averageConfidence: data.average_confidence,
    recentScans: data.recent_scans.map(mapScanResponse),
  };
}

export async function fetchPatientDashboardStats(): Promise<PatientDashboardStats> {
  const response = await apiFetch(`${getApiBaseUrl()}/dashboard/patient-stats`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as PatientDashboardApiResponse;
  return {
    totalScans: data.total_scans,
    normalScans: data.normal_scans,
    pneumoniaScans: data.pneumonia_scans,
    covidScans: data.covid_scans ?? 0,
    averageConfidence: data.average_confidence,
    lastScanResult: data.last_scan_result,
    lastScanDate: data.last_scan_date,
  };
}

/** Backend caps list `limit` query params at 200. */
export const API_LIST_LIMIT_MAX = 200;

export async function fetchScans(limit = 50): Promise<ScanRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), API_LIST_LIMIT_MAX);
  const response = await apiFetch(`${getApiBaseUrl()}/scans?limit=${safeLimit}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as ScanListApiResponse;
  return data.items.map(mapScanResponse);
}

export function getScanReportUrl(scanId: string | number): string {
  return `${getApiBaseUrl()}/scans/${scanId}/report`;
}

export interface AiChatApiResponse {
  answer: string;
}

export async function postScanAiChat(
  scanId: string | number,
  message: string,
): Promise<string> {
  const response = await apiFetch(`${getApiBaseUrl()}/scans/${scanId}/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (response.status === 404) {
    throw new Error("Scan not found or you do not have access to this scan.");
  }
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as AiChatApiResponse;
  return data.answer;
}

export async function fetchScanById(
  scanId: string | number,
): Promise<ScanRecord> {
  const response = await apiFetch(`${getApiBaseUrl()}/scans/${scanId}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    throw new Error("Scan not found.");
  }
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as ScanApiResponse;
  return mapScanResponse(data);
}

export interface ScanNoteApiResponse {
  id: number;
  scan_id: number;
  doctor_id: number;
  note_text: string;
  created_at: string;
  updated_at: string;
}

export interface ScanNoteListApiResponse {
  items: ScanNoteApiResponse[];
}

function mapScanNote(data: ScanNoteApiResponse): ScanNoteRecord {
  return {
    id: data.id,
    scanId: data.scan_id,
    doctorId: data.doctor_id,
    noteText: data.note_text,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function fetchScanNotes(
  scanId: string | number,
): Promise<ScanNoteRecord[]> {
  const response = await apiFetch(`${getApiBaseUrl()}/scans/${scanId}/notes`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as ScanNoteListApiResponse;
  return data.items.map(mapScanNote);
}

export async function createScanNote(
  scanId: string | number,
  noteText: string,
): Promise<ScanNoteRecord> {
  const response = await apiFetch(`${getApiBaseUrl()}/scans/${scanId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note_text: noteText }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as ScanNoteApiResponse;
  return mapScanNote(data);
}

export async function updateScanNote(
  scanId: string | number,
  noteId: number,
  noteText: string,
): Promise<ScanNoteRecord> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/scans/${scanId}/notes/${noteId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_text: noteText }),
    },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as ScanNoteApiResponse;
  return mapScanNote(data);
}

export async function deleteScanNote(
  scanId: string | number,
  noteId: number,
): Promise<void> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/scans/${scanId}/notes/${noteId}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return null;
        })
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    // ignore JSON parse errors
  }
  if (response.status === 413) {
    return "The image is too large. Try a file under 20 MB.";
  }
  if (response.status === 422) {
    return "The uploaded image did not pass quality checks. Please review the message below.";
  }
  if (response.status >= 500) {
    return "The analysis service is unavailable. Please try again later.";
  }
  return `Analysis failed (${response.status}). Please try again.`;
}

/** Analyze an X-ray for an accepted patient (POST /patients/{patient_id}/predict). */
export async function predictXrayForPatient(
  patientId: number,
  file: File,
): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  let response: Response;
  try {
    response = await apiFetch(
      `${getApiBaseUrl()}/patients/${patientId}/predict`,
      {
        method: "POST",
        body: formData,
      },
    );
  } catch {
    throw new PredictApiError(
      "Could not reach the analysis server. Is the backend running on port 8000?",
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new PredictApiError(message, response.status);
  }

  const data = (await response.json()) as PredictApiResponse;
  return mapPredictResponse(data);
}
