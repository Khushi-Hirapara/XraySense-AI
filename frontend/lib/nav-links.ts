import type { LucideIcon } from "lucide-react";
import {
  Bot,
  ChartColumn,
  Database,
  FileText,
  History,
  Home,
  LayoutDashboard,
  Upload,
  User,
  Users,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import {
  DOCTOR_DASHBOARD_PATH,
  PATIENT_DASHBOARD_PATH,
  PROFILE_PATH,
} from "@/lib/auth-routes";

export const PATIENT_REPORTS_PATH = "/patient/reports";
export const PATIENTS_PATH = "/patients";
export const ASSISTANT_PATH = "/assistant";
export const MODEL_EVALUATION_PATH = "/doctor/model-evaluation";
export const DATASET_EDA_PATH = "/doctor/dataset-eda";

export interface NavLinkItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Guest nav — landing page only (logo also returns here). */
export const PUBLIC_NAV_LINKS: NavLinkItem[] = [
  { href: "/", label: "Home", icon: Home },
];

/** Doctor nav — no Home; Dashboard is the primary entry after login. */
export const DOCTOR_NAV_LINKS: NavLinkItem[] = [
  { href: DOCTOR_DASHBOARD_PATH, label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze X-Ray", icon: Upload },
  { href: "/history", label: "History", icon: History },
  { href: PATIENTS_PATH, label: "Patients", icon: Users },
  { href: ASSISTANT_PATH, label: "AI Assistant", icon: Bot },
  { href: DATASET_EDA_PATH, label: "Dataset", icon: Database },
  { href: MODEL_EVALUATION_PATH, label: "Evaluation", icon: ChartColumn },
  { href: PROFILE_PATH, label: "Profile", icon: User },
];

/** Patient nav — no Home; Dashboard is the primary entry after login. */
export const PATIENT_NAV_LINKS: NavLinkItem[] = [
  { href: PATIENT_DASHBOARD_PATH, label: "Dashboard", icon: LayoutDashboard },
  { href: PATIENT_REPORTS_PATH, label: "My Reports", icon: FileText },
  { href: ASSISTANT_PATH, label: "AI Assistant", icon: Bot },
  { href: PROFILE_PATH, label: "Profile", icon: User },
];

export function navLinksForRole(role: UserRole | undefined): NavLinkItem[] {
  if (role === "patient") return PATIENT_NAV_LINKS;
  if (role === "doctor") return DOCTOR_NAV_LINKS;
  return PUBLIC_NAV_LINKS;
}

export function dashboardHrefForRole(role: UserRole | undefined): string {
  if (role === "patient") return PATIENT_DASHBOARD_PATH;
  return DOCTOR_DASHBOARD_PATH;
}
