import {
  clearAuthStorage,
  getAccessToken,
  notifyUnauthorized,
} from "@/lib/auth-storage";

const DEFAULT_API_BASE = "http://localhost:8000";

function resolveApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;
  return raw.replace(/\/api\/v1\/?$/i, "").replace(/\/$/, "");
}

function isNgrokHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.includes("ngrok");
  } catch {
    return false;
  }
}

/** Authenticated fetch; clears session and emits event on 401. */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // ngrok free tier blocks browser fetch without this header.
  if (isNgrokHost(input) || isNgrokHost(resolveApiBaseUrl())) {
    headers.set("ngrok-skip-browser-warning", "true");
  }

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch {
    throw new Error(
      `Could not reach the API at ${resolveApiBaseUrl()}. Is the backend running?`,
    );
  }

  if (response.status === 401) {
    clearAuthStorage();
    notifyUnauthorized();
  }

  return response;
}
