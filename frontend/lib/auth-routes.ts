import type { UserRole } from "@/lib/types";

export const DOCTOR_DASHBOARD_PATH = "/doctor/dashboard";
export const PATIENT_DASHBOARD_PATH = "/patient/dashboard";
export const PROFILE_PATH = "/profile";

const DOCTOR_ONLY_PREFIXES = ["/analyze", "/history", "/patients", "/doctor"] as const;

function isPatientPortalPath(path: string): boolean {
  return (
    path === PATIENT_DASHBOARD_PATH ||
    path.startsWith("/patient/") ||
    path.startsWith("/patient?")
  );
}

function isDoctorOnlyPath(path: string): boolean {
  return DOCTOR_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function dashboardPathForRole(role: UserRole): string {
  return role === "patient" ? PATIENT_DASHBOARD_PATH : DOCTOR_DASHBOARD_PATH;
}

/** Post-login redirect: honor a valid ?next=; otherwise go to the role dashboard. */
export function resolvePostAuthPath(
  role: UserRole,
  next: string | null | undefined,
): string {
  if (next && next.startsWith("/") && isPathAllowedForRole(next, role)) {
    return next;
  }
  return dashboardPathForRole(role);
}

export function isPathAllowedForRole(path: string, role: UserRole): boolean {
  if (path === PROFILE_PATH || path.startsWith(`${PROFILE_PATH}/`)) {
    return true;
  }
  if (path === "/" || path.startsWith("/scans/") || path.startsWith("/assistant")) {
    return true;
  }
  if (isDoctorOnlyPath(path)) {
    return role === "doctor";
  }
  if (isPatientPortalPath(path)) {
    return role === "patient";
  }
  return true;
}
