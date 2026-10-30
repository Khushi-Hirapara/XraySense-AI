import { getApiBaseUrl } from "@/lib/api";

export interface InvitationPreview {
  email: string;
  patientName: string | null;
  doctorName: string;
  status: string;
  expiresAt: string;
}

export interface AcceptInvitationPayload {
  name: string;
  password: string;
  confirmPassword: string;
}

export interface AcceptInvitationResult {
  message: string;
  accessToken: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      const first = body.detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  } catch {
    // ignore
  }
  return `Request failed (${response.status}).`;
}

export async function fetchInvitationPreview(
  token: string,
): Promise<InvitationPreview> {
  const response = await fetch(
    `${getApiBaseUrl()}/patient-invitations/accept/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    email: string;
    patient_name: string | null;
    doctor_name: string;
    status: string;
    expires_at: string;
  };
  return {
    email: data.email,
    patientName: data.patient_name,
    doctorName: data.doctor_name,
    status: data.status,
    expiresAt: data.expires_at,
  };
}

export async function acceptInvitation(
  token: string,
  payload: AcceptInvitationPayload,
): Promise<AcceptInvitationResult> {
  const response = await fetch(
    `${getApiBaseUrl()}/patient-invitations/accept/${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        password: payload.password,
        confirm_password: payload.confirmPassword,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as {
    message: string;
    access_token: string;
    token_type: string;
  };
  return {
    message: data.message,
    accessToken: data.access_token,
  };
}
