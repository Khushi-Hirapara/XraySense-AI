import {
  API_LIST_LIMIT_MAX,
  getApiBaseUrl,
  mapScanResponse,
  type ScanListApiResponse,
} from "@/lib/api";
import { apiFetch } from "@/lib/api-client";
import type { ScanRecord } from "@/lib/types";

export function patientReportsPath(patientId: number): string {
  return `/doctor/patients/${patientId}/reports`;
}

export function patientComparePath(
  patientId: number,
  options?: { baselineId?: string; followUpId?: string },
): string {
  const base = `/doctor/patients/${patientId}/compare`;
  const params = new URLSearchParams();
  if (options?.baselineId) params.set("baseline", options.baselineId);
  if (options?.followUpId) params.set("followUp", options.followUpId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function patientTrendsPath(patientId: number): string {
  return `/doctor/patients/${patientId}/trends`;
}

export interface PatientRecord {
  id: number;
  doctorId: number;
  userId: number | null;
  name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

export interface PatientInvitationRecord {
  id: number;
  doctorId: number;
  patientName: string | null;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  emailStatus: string | null;
  emailErrorLog: string | null;
}

export interface GroupedInvitations {
  pending: PatientInvitationRecord[];
  accepted: PatientInvitationRecord[];
  expired: PatientInvitationRecord[];
  cancelled: PatientInvitationRecord[];
}

export interface PatientListApiResponse {
  items: PatientApiRecord[];
  total: number;
}

export interface PatientApiRecord {
  id: number;
  doctor_id: number;
  user_id: number | null;
  name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface PatientInvitationApiRecord {
  id: number;
  doctor_id: number;
  patient_name: string | null;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  email_status: string | null;
  email_error_log: string | null;
}

interface InvitationStatusGroupApi {
  items: PatientInvitationApiRecord[];
  total: number;
}

export interface GroupedInvitationsApiResponse {
  pending: InvitationStatusGroupApi;
  accepted: InvitationStatusGroupApi;
  expired: InvitationStatusGroupApi;
  cancelled: InvitationStatusGroupApi;
}

export interface CreatePatientPayload {
  name: string;
  age: number;
  gender: string;
  email?: string;
  phone?: string;
}

export interface InvitePatientPayload {
  patient_email: string;
  patient_name?: string;
}

function mapPatient(data: PatientApiRecord): PatientRecord {
  return {
    id: data.id,
    doctorId: data.doctor_id,
    userId: data.user_id,
    name: data.name,
    age: data.age,
    gender: data.gender,
    phone: data.phone,
    email: data.email,
    createdAt: data.created_at,
  };
}

function mapInvitation(data: PatientInvitationApiRecord): PatientInvitationRecord {
  return {
    id: data.id,
    doctorId: data.doctor_id,
    patientName: data.patient_name,
    email: data.email,
    status: data.status,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    acceptedAt: data.accepted_at,
    emailStatus: data.email_status,
    emailErrorLog: data.email_error_log,
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

/** Accepted patients only (portal linked). */
export async function fetchPatientById(patientId: number): Promise<PatientRecord> {
  const response = await apiFetch(`${getApiBaseUrl()}/patients/${patientId}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    throw new Error("Patient not found.");
  }
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as PatientApiRecord;
  return mapPatient(data);
}

export async function fetchPatientScans(
  patientId: number,
  limit = 100,
): Promise<ScanRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), API_LIST_LIMIT_MAX);
  const response = await apiFetch(
    `${getApiBaseUrl()}/patients/${patientId}/scans?limit=${safeLimit}`,
    { cache: "no-store" },
  );
  if (response.status === 404) {
    throw new Error("Patient not found.");
  }
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as ScanListApiResponse;
  return data.items.map(mapScanResponse);
}

export async function fetchPatients(limit = 100): Promise<PatientRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), API_LIST_LIMIT_MAX);
  const response = await apiFetch(`${getApiBaseUrl()}/patients?limit=${safeLimit}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as PatientListApiResponse;
  return data.items.map(mapPatient);
}

export async function fetchGroupedInvitations(): Promise<GroupedInvitations> {
  const response = await apiFetch(`${getApiBaseUrl()}/patients/invitations`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as GroupedInvitationsApiResponse;
  return {
    pending: data.pending.items.map(mapInvitation),
    accepted: data.accepted.items.map(mapInvitation),
    expired: data.expired.items.map(mapInvitation),
    cancelled: data.cancelled.items.map(mapInvitation),
  };
}

export async function fetchPendingInvitations(): Promise<PatientInvitationRecord[]> {
  const grouped = await fetchGroupedInvitations();
  return grouped.pending;
}

export async function createPatient(
  payload: CreatePatientPayload,
): Promise<PatientRecord> {
  const response = await apiFetch(`${getApiBaseUrl()}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      age: payload.age,
      gender: payload.gender,
      email: payload.email || null,
      phone: payload.phone?.trim() || null,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as PatientApiRecord;
  return mapPatient(data);
}

export async function invitePatient(
  payload: InvitePatientPayload,
): Promise<{ invitation: PatientInvitationRecord; message: string }> {
  const response = await apiFetch(`${getApiBaseUrl()}/patients/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    message: string;
    invitation: PatientInvitationApiRecord;
  };
  return {
    invitation: mapInvitation(data.invitation),
    message: data.message,
  };
}

export async function cancelPatientInvitation(
  invitationId: number,
): Promise<PatientInvitationRecord> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/patients/invitations/${invitationId}/cancel`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    message: string;
    invitation: PatientInvitationApiRecord;
  };
  return mapInvitation(data.invitation);
}

export async function resendPatientInvitation(
  invitationId: number,
): Promise<PatientInvitationRecord> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/patients/invitations/${invitationId}/resend`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    message: string;
    invitation: PatientInvitationApiRecord;
  };
  return mapInvitation(data.invitation);
}
