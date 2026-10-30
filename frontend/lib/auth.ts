import { getApiBaseUrl, getSsoBaseUrl } from "@/lib/api";
import { apiFetch } from "@/lib/api-client";
import {
  clearAuthStorage,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setStoredUser,
} from "@/lib/auth-storage";
import type { AuthUser, UserRole } from "@/lib/types";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string | null;
  user: UserApiResponse;
}

export interface UserApiResponse {
  id: number;
  name: string;
  email: string;
  role: string;
  email_verified_at?: string | null;
  created_at: string;
}

export interface MessageResponse {
  message: string;
}

export type SsoProvider = "google" | "microsoft";

export class AuthApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

function mapUser(data: UserApiResponse): AuthUser {
  const role = data.role === "patient" ? "patient" : "doctor";
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: role as UserRole,
    createdAt: data.created_at,
    emailVerifiedAt: data.email_verified_at ?? null,
  };
}

async function parseAuthError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string") return detail;
  } catch {
    // ignore
  }
  return `Request failed (${response.status}).`;
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(
      `Could not reach the API at ${getApiBaseUrl()}. Is the backend running, and does NEXT_PUBLIC_API_BASE_URL match its port?`,
    );
  }

  if (!response.ok) {
    throw new AuthApiError(await parseAuthError(response), response.status);
  }

  return (await response.json()) as T;
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/login", { email, password });
}

export async function registerRequest(
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const data = await postJson<UserApiResponse>("/auth/register", {
    name,
    email,
    password,
  });
  return mapUser(data);
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const response = await apiFetch(`${getApiBaseUrl()}/auth/me`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AuthApiError(await parseAuthError(response), response.status);
  }

  const data = (await response.json()) as UserApiResponse;
  return mapUser(data);
}

export async function verifyEmailRequest(token: string): Promise<string> {
  const data = await postJson<MessageResponse>("/auth/verify-email", { token });
  return data.message;
}

export async function resendVerificationRequest(email: string): Promise<string> {
  const data = await postJson<MessageResponse>("/auth/resend-verification", {
    email,
  });
  return data.message;
}

export async function forgotPasswordRequest(email: string): Promise<string> {
  const data = await postJson<MessageResponse>("/auth/forgot-password", {
    email,
  });
  return data.message;
}

export async function resetPasswordRequest(
  token: string,
  password: string,
): Promise<string> {
  const data = await postJson<MessageResponse>("/auth/reset-password", {
    token,
    password,
  });
  return data.message;
}

export async function refreshSessionRequest(
  refreshToken: string,
): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/refresh", {
    refresh_token: refreshToken,
  });
}

export function getSsoLoginUrl(
  provider: SsoProvider,
  nextPath?: string | null,
): string {
  const params = new URLSearchParams();
  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    params.set("next", nextPath);
  }
  const query = params.size ? `?${params.toString()}` : "";
  // SSO must start on the same public host as GOOGLE/MICROSOFT_REDIRECT_URI
  // (often ngrok). Regular API calls can use localhost via getApiBaseUrl().
  return `${getSsoBaseUrl()}/auth/sso/${provider}/login${query}`;
}

export async function exchangeSsoCode(code: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/sso/exchange", { code });
}

export async function logoutRequest(refreshToken: string | null): Promise<void> {
  try {
    await postJson<MessageResponse>("/auth/logout", {
      refresh_token: refreshToken,
    });
  } catch {
    // Client session is cleared regardless of server response.
  }
}

export async function persistSession(
  token: string,
  userFromLogin?: UserApiResponse,
  refreshToken?: string | null,
): Promise<AuthUser> {
  setAccessToken(token);
  if (refreshToken) {
    setRefreshToken(refreshToken);
  }
  const user = userFromLogin ? mapUser(userFromLogin) : await fetchCurrentUser();
  setStoredUser(user);
  return user;
}

export async function clearSession(): Promise<void> {
  const refreshToken = getRefreshToken();
  await logoutRequest(refreshToken);
  clearAuthStorage();
}
