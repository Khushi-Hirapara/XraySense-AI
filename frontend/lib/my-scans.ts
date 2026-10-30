import {
  API_LIST_LIMIT_MAX,
  getApiBaseUrl,
  mapScanResponse,
  type ScanApiResponse,
  type ScanListApiResponse,
  type ScanNoteListApiResponse,
  type ScanNoteApiResponse,
} from "@/lib/api";
import { apiFetch } from "@/lib/api-client";
import type { ScanNoteRecord, ScanRecord } from "@/lib/types";

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

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // ignore
  }
  return `Request failed (${response.status}).`;
}

/** List scans for the authenticated patient (own profile only). */
export async function fetchMyScans(limit = 100): Promise<ScanRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), API_LIST_LIMIT_MAX);
  const response = await apiFetch(`${getApiBaseUrl()}/my/scans?limit=${safeLimit}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as ScanListApiResponse;
  return data.items.map(mapScanResponse);
}

/** Get one scan owned by the authenticated patient. */
export async function fetchMyScanById(scanId: string | number): Promise<ScanRecord> {
  const response = await apiFetch(`${getApiBaseUrl()}/my/scans/${scanId}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    throw new Error("Scan not found.");
  }
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as ScanApiResponse;
  return mapScanResponse(data);
}

export function getMyScanReportUrl(scanId: string | number): string {
  return `${getApiBaseUrl()}/my/scans/${scanId}/report`;
}

/** Read-only doctor notes for the patient's own scan. */
export async function fetchMyScanNotes(
  scanId: string | number,
): Promise<ScanNoteRecord[]> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/my/scans/${scanId}/notes`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as ScanNoteListApiResponse;
  return data.items.map(mapScanNote);
}

export async function postMyScanAiChat(
  scanId: string | number,
  message: string,
): Promise<string> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/my/scans/${scanId}/ai-chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  if (response.status === 404) {
    throw new Error("Scan not found or you do not have access to this scan.");
  }
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as { answer: string };
  return data.answer;
}
