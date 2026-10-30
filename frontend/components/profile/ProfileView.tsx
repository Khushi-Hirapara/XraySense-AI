"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Calendar,
  FileText,
  History,
  LayoutDashboard,
  Mail,
  Shield,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchCurrentUser } from "@/lib/auth";
import { setStoredUser } from "@/lib/auth-storage";
import { PATIENT_DASHBOARD_PATH } from "@/lib/auth-routes";
import { PATIENT_REPORTS_PATH } from "@/lib/nav-links";
import { Card } from "@/components/ui/Card";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import { fetchScans } from "@/lib/api";
import { fetchMyScans } from "@/lib/my-scans";
import type { AuthUser, ScanRecord } from "@/lib/types";
import { countPredictions } from "@/lib/prediction";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface ProfileStats {
  total: number;
  pneumonia: number;
  covid: number;
  normal: number;
  avgConfidence: number;
}

function computeStats(scans: ScanRecord[]): ProfileStats {
  const counts = countPredictions(scans);
  return {
    total: counts.total,
    pneumonia: counts.pneumonia,
    covid: counts.covid,
    normal: counts.normal,
    avgConfidence: counts.avgConfidence,
  };
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "teal" | "rose" | "slate";
}) {
  const accentClasses = {
    teal: "from-teal-50 to-cyan-50/80 ring-teal-100 dark:from-teal-500/15 dark:to-cyan-500/10 dark:ring-teal-500/25",
    rose: "from-rose-50 to-orange-50/60 ring-rose-100 dark:from-rose-500/15 dark:to-orange-500/10 dark:ring-rose-500/25",
    slate: "from-slate-50 to-slate-100/60 ring-slate-200 dark:from-slate-800/80 dark:to-slate-900 dark:ring-slate-600/50",
  }[accent ?? "slate"];

  return (
    <div
      className={cn(
        "rounded-2xl border border-transparent bg-gradient-to-br p-4 ring-1 ring-inset dark:border-slate-700/40",
        accentClasses,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5 transition hover:border-teal-100 hover:bg-teal-50/30 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-teal-700/50 dark:hover:bg-teal-950/30">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:text-teal-300 dark:ring-slate-600">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100",
            mono && "font-mono text-xs sm:text-sm",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function ProfileView({ user: initialUser }: { user: AuthUser }) {
  const { logout } = useAuth();
  const [user, setUser] = useState(initialUser);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchCurrentUser();
        if (!cancelled) {
          setUser(profile);
          setStoredUser(profile);
        }
      } catch {
        // keep cached profile
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data =
          user.role === "patient"
            ? await fetchMyScans(200)
            : await fetchScans(200);
        if (!cancelled) setScans(data);
      } catch {
        if (!cancelled) setScans([]);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.role]);

  const stats = useMemo(() => computeStats(scans), [scans]);
  const initials = getInitials(user.name);
  const memberSince = user.createdAt ? formatDate(user.createdAt) : null;
  const isDoctor = user.role === "doctor";
  const isPatient = user.role === "patient";

  const heroLinks = isPatient
    ? [
        {
          href: PATIENT_DASHBOARD_PATH,
          label: "My Dashboard",
          icon: LayoutDashboard,
          primary: true,
        },
        {
          href: PATIENT_REPORTS_PATH,
          label: "My Reports",
          icon: FileText,
          primary: false,
        },
      ]
    : [
        {
          href: "/analyze",
          label: "Analyze X-Ray",
          icon: Upload,
          primary: true,
        },
        {
          href: "/history",
          label: "View history",
          icon: History,
          primary: false,
        },
      ];

  const quickLinks = isPatient
    ? [
        {
          href: PATIENT_DASHBOARD_PATH,
          label: "My Dashboard",
          icon: LayoutDashboard,
          desc: "Overview and latest results",
        },
        {
          href: PATIENT_REPORTS_PATH,
          label: "My Reports",
          icon: FileText,
          desc: "Screening results and PDFs",
        },
      ]
    : [
        {
          href: "/analyze",
          label: "Analyze X-Ray",
          icon: Upload,
          desc: "Run a new screening",
        },
        {
          href: "/history",
          label: "Scan history",
          icon: History,
          desc: "Browse past studies",
        },
      ];

  return (
    <div className="page-shell">
      <div className="page-content">
        {/* Hero */}
        <div className="profile-hero relative overflow-hidden rounded-3xl border border-teal-200/40 bg-gradient-to-br from-teal-600 via-teal-600 to-cyan-700 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-10">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-cyan-300/20 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="profile-avatar flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold tracking-tight text-white ring-2 ring-white/30 backdrop-blur-sm sm:h-24 sm:w-24 sm:text-3xl">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-teal-50 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Your account
                </p>
                <h1 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">
                  {user.name}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-teal-50/95">
                  <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  {user.email}
                </p>
                {memberSince && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-teal-100/90">
                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Member since {memberSince}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
              {heroLinks.map(({ href, label, icon: Icon, primary }) => (
                <Link
                  key={href}
                  href={href}
                  className={
                    primary
                      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50"
                      : "inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <section className="mt-8" aria-labelledby="profile-stats-heading">
          <h2
            id="profile-stats-heading"
            className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <Activity className="h-4 w-4 text-teal-600" aria-hidden />
            Your activity
          </h2>

          {statsLoading ? (
            <LoadingPanel message="Loading your scan statistics…" className="py-10" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label="Total scans"
                value={stats.total}
                sub={
                  stats.total === 0
                    ? isDoctor
                      ? "Upload your first X-ray"
                      : "No screenings yet"
                    : "All time"
                }
                accent="teal"
              />
              <StatCard
                label="Pneumonia flagged"
                value={stats.pneumonia}
                sub={
                  stats.total > 0
                    ? `${Math.round((stats.pneumonia / stats.total) * 100)}% of scans`
                    : "-"
                }
                accent="rose"
              />
              <StatCard
                label="COVID flagged"
                value={stats.covid}
                sub={
                  stats.total > 0
                    ? `${Math.round((stats.covid / stats.total) * 100)}% of scans`
                    : "-"
                }
                accent="rose"
              />
              <StatCard
                label="Normal results"
                value={stats.normal}
                accent="slate"
              />
              <StatCard
                label="Avg. confidence"
                value={
                  stats.total > 0
                    ? `${Math.round(stats.avgConfidence * 100)}%`
                    : "-"
                }
                sub="Across your studies"
                accent="teal"
              />
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          {/* Account details */}
          <Card className="lg:col-span-3">
            <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <User className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Account details
                </h2>
                <p className="text-sm text-slate-500">
                  Information tied to your XRaySense AI login
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <DetailRow icon={User} label="Full name" value={user.name} />
              <DetailRow icon={Mail} label="Email address" value={user.email} />
              {memberSince && (
                <DetailRow
                  icon={Calendar}
                  label="Member since"
                  value={memberSince}
                />
              )}
              <DetailRow
                icon={Shield}
                label="Account ID"
                value={`#${user.id}`}
                mono
              />
            </div>
          </Card>

          {/* Sidebar */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card className="bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-950 dark:ring-1 dark:ring-teal-500/15">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Quick links
              </h2>
              <ul className="mt-4 space-y-2">
                {quickLinks.map(({ href, label, icon: Icon, desc }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 transition hover:border-teal-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-teal-600/50 dark:hover:bg-slate-800"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition group-hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:group-hover:bg-teal-500/25">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {label}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {desc}
                        </span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600 dark:text-slate-500 dark:group-hover:text-teal-400"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="border-slate-200/80 bg-slate-50/50 dark:border-teal-700/40 dark:bg-slate-900/80 dark:shadow-teal-950/20 dark:ring-1 dark:ring-teal-500/20">
              <div className="flex gap-3">
                <Shield className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Session security
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Your sign-in token is stored for this browser tab only and
                    cleared when you log out or close the tab.
                  </p>
                  <button
                    type="button"
                    onClick={logout}
                    className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-rose-500/50 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                  >
                    Log out of this device
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
