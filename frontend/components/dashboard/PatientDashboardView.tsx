"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FileText,
  HeartPulse,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { PatientScanCard } from "@/components/dashboard/PatientScanCard";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { PredictionBadge, SeverityBadge } from "@/components/ui/Badge";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import { fetchPatientDashboardStats } from "@/lib/api";
import { PATIENT_REPORTS_PATH } from "@/lib/nav-links";
import { fetchMyScans } from "@/lib/my-scans";
import type { PatientDashboardStats, ScanRecord } from "@/lib/types";
import { formatDate, formatPercent } from "@/lib/utils";

function DashboardSkeleton() {
  return (
    <div className="page-content flex-1">
      <div className="h-40 animate-pulse rounded-3xl bg-slate-200/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
        ))}
      </div>
      <div className="mt-8 h-96 animate-pulse rounded-2xl bg-slate-200/50" />
    </div>
  );
}

export function PatientDashboardView() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PatientDashboardStats | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsData, scanData] = await Promise.all([
        fetchPatientDashboardStats(),
        fetchMyScans(100),
      ]);
      setStats(statsData);
      setScans(scanData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return (
      <div className="page-content flex flex-1 flex-col justify-center">
        <ErrorAlert
          title="Dashboard unavailable"
          message={`${error ?? "Unknown error"} Ensure the backend is running.`}
        />
      </div>
    );
  }

  const avgConfidence =
    stats.averageConfidence !== null && stats.averageConfidence !== undefined
      ? formatPercent(stats.averageConfidence)
      : "—";

  const latestScan = scans[0] ?? null;
  const welcomeName = user?.name?.trim() || "there";

  return (
    <div className="page-content flex flex-1 flex-col gap-8 sm:gap-10 lg:gap-12">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-600 via-teal-600 to-teal-800 px-6 py-8 text-white shadow-xl shadow-teal-900/15 sm:rounded-3xl sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <HeartPulse className="h-3.5 w-3.5" aria-hidden />
            Patient portal
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome, {welcomeName}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-cyan-50/95 sm:text-base">
            View your chest X-ray screening results and download clinical reports shared
            by your care team. This portal shows only your own studies.
          </p>
        </div>
      </section>

      {/* Overview stats */}
      <section aria-label="Your screening overview">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Overview
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardStatCard
            label="Total Scans"
            value={stats.totalScans}
            accent="teal"
            icon={ScanLine}
          />
          <DashboardStatCard
            label="Latest Result"
            value={stats.lastScanResult ?? "—"}
            sub={
              stats.lastScanDate
                ? formatDate(stats.lastScanDate)
                : "No scans yet"
            }
            accent="cyan"
            icon={Activity}
          />
          <DashboardStatCard
            label="Normal"
            value={stats.normalScans}
            accent="emerald"
            icon={ShieldCheck}
          />
          <DashboardStatCard
            label="Pneumonia"
            value={stats.pneumoniaScans}
            accent="rose"
            icon={Shield}
          />
          <DashboardStatCard
            label="COVID"
            value={stats.covidScans}
            accent="amber"
            icon={Activity}
          />
          <DashboardStatCard
            label="Avg. Confidence"
            value={avgConfidence}
            sub="Across your studies"
            accent="slate"
            icon={Sparkles}
          />
        </div>
      </section>

      {/* Latest result highlight */}
      {latestScan ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Latest result
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PredictionBadge label={latestScan.prediction} />
            <SeverityBadge severity={latestScan.severity} />
            <span className="text-sm font-semibold tabular-nums text-slate-700">
              {formatPercent(latestScan.confidence)} confidence
            </span>
            <span className="text-sm text-slate-500">
              {formatDate(latestScan.createdAt)}
            </span>
          </div>
        </section>
      ) : null}

      {/* My Scan History / Reports */}
      <DashboardPanel
        eyebrow="Your records"
        title="My Scan History"
        description="View details and download PDF reports for each of your chest X-ray screenings."
        icon={FileText}
        action={
          scans.length > 0 ? (
            <Link
              href={PATIENT_REPORTS_PATH}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              View all reports
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : undefined
        }
      >
        {scans.length === 0 ? (
          <DashboardEmptyState
            icon={ScanLine}
            title="No reports yet"
            description="When your doctor completes a chest X-ray analysis for you, results and downloadable reports will appear here."
            className="min-h-[280px]"
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{scans.length}</span>{" "}
              screening report{scans.length === 1 ? "" : "s"} on your account
            </p>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {scans.map((scan) => (
                <PatientScanCard key={scan.id} scan={scan} />
              ))}
            </div>
          </>
        )}
      </DashboardPanel>

      <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-sm sm:px-6">
        <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-sm">
          <span className="font-semibold text-slate-700">XRaySense AI</span> results
          support clinical review and are not a final diagnosis. Contact your doctor
          with any health concerns.
        </p>
      </section>
    </div>
  );
}
