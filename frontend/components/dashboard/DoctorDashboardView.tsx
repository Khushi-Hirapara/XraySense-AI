"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  History,
  MailPlus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { InvitePatientModal } from "@/components/dashboard/InvitePatientModal";
import { MyPatientsSection } from "@/components/dashboard/MyPatientsSection";
import { PatientInvitationsSection } from "@/components/dashboard/PatientInvitationsSection";
import { DashboardStatCard } from "@/components/dashboard/DashboardStatCard";
import { PredictionBadge, SeverityBadge } from "@/components/ui/Badge";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import { StudyImage } from "@/components/ui/StudyImage";
import { Toast } from "@/components/ui/Toast";
import { fetchDoctorDashboardStats, fetchScans } from "@/lib/api";
import {
  buildPatientScanStatsMap,
  findPatientIdByEmail,
  type PatientScanStats,
} from "@/lib/patient-scan-stats";
import {
  cancelPatientInvitation,
  fetchGroupedInvitations,
  fetchPatients,
  resendPatientInvitation,
  type GroupedInvitations,
  type PatientInvitationRecord,
  type PatientRecord,
} from "@/lib/patients";
import type { DoctorDashboardStats } from "@/lib/types";
import { cn, formatDate, formatPercent } from "@/lib/utils";

function flattenInvitations(grouped: GroupedInvitations): PatientInvitationRecord[] {
  return [
    ...grouped.pending,
    ...grouped.accepted,
    ...grouped.expired,
    ...grouped.cancelled,
  ];
}

const QUICK_ACTIONS = [
  {
    label: "Invite Patient",
    description: "Send portal invitation",
    icon: MailPlus,
    onClickKey: "invite" as const,
    accent: "bg-cyan-50 text-cyan-700 ring-cyan-100 hover:bg-cyan-100/80 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30 dark:hover:bg-cyan-500/25",
  },
  {
    label: "Analyze X-Ray",
    description: "Run AI screening",
    icon: Upload,
    href: "/analyze",
    accent: "bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/25",
  },
  {
    label: "Scan History",
    description: "Review all studies",
    icon: History,
    href: "/history",
    accent: "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100/80 dark:bg-slate-700/60 dark:text-slate-200 dark:ring-slate-500/40 dark:hover:bg-slate-700",
  },
] as const;

function DashboardSkeleton() {
  return (
    <div className="page-content flex-1">
      <div className="h-44 animate-pulse rounded-3xl bg-slate-200/70" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
        ))}
      </div>
      <div className="mt-8 space-y-6">
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200/50" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200/50" />
      </div>
    </div>
  );
}

export function DoctorDashboardView() {
  const [stats, setStats] = useState<DoctorDashboardStats | null>(null);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [invitations, setInvitations] = useState<PatientInvitationRecord[]>([]);
  const [scanStats, setScanStats] = useState<Map<number, PatientScanStats>>(new Map());
  const [patientSearch, setPatientSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<number | null>(null);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [statsData, patientData, groupedInvites, scans] = await Promise.all([
        fetchDoctorDashboardStats(),
        fetchPatients(),
        fetchGroupedInvitations(),
        fetchScans(200),
      ]);
      setStats(statsData);
      setPatients(patientData);
      setInvitations(flattenInvitations(groupedInvites));
      setScanStats(buildPatientScanStatsMap(patientData, scans));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resolvePatientIdByEmail = useCallback(
    (email: string) => findPatientIdByEmail(patients, email),
    [patients],
  );

  const avgConfidence =
    stats?.averageConfidence !== null && stats?.averageConfidence !== undefined
      ? formatPercent(stats.averageConfidence)
      : "—";

  const openInvite = () => setInviteModalOpen(true);

  const handleInviteSuccess = () => {
    setToast("Invitation sent successfully");
    void loadData({ silent: true });
  };

  const handleResendInvitation = async (invitationId: number) => {
    setInvitationActionId(invitationId);
    try {
      await resendPatientInvitation(invitationId);
      setToast("Invitation resent");
      void loadData({ silent: true });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not resend invitation.");
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: number) => {
    setInvitationActionId(invitationId);
    try {
      await cancelPatientInvitation(invitationId);
      setToast("Invitation cancelled");
      void loadData({ silent: true });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not cancel invitation.");
    } finally {
      setInvitationActionId(null);
    }
  };

  const activePatientCount = patients.length;
  const pendingInviteCount = useMemo(
    () => invitations.filter((i) => i.status.toLowerCase() === "pending").length,
    [invitations],
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return (
      <div className="page-content flex flex-1 flex-col justify-center">
        <ErrorAlert
          title="Dashboard unavailable"
          message={
            error
              ? `${error} Ensure the backend is running on port 8001.`
              : "Ensure the backend is running on port 8001."
          }
        />
      </div>
    );
  }

  const hasScans = stats.recentScans.length > 0;

  return (
    <div className="page-content flex flex-1 flex-col gap-8 sm:gap-10 lg:gap-12">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}

      {/* Hero */}
      <section className="relative shrink-0 overflow-hidden rounded-2xl border border-teal-200/50 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 px-6 py-8 text-white shadow-xl shadow-teal-900/15 sm:rounded-3xl sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-40 w-2/3 rounded-tr-[100%] bg-cyan-400/15 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI-assisted doctor dashboard
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-teal-50/95 sm:text-base">
              Invite patients to the portal, manage active patients, and review AI chest
              X-ray screenings.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openInvite}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-teal-800 shadow-lg shadow-teal-950/20 transition hover:-translate-y-0.5 hover:bg-teal-50 hover:shadow-xl"
              >
                <MailPlus className="h-4 w-4" aria-hidden />
                Invite Patient
              </button>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Analyze X-Ray
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
            <span className="rounded-xl bg-white/15 px-3 py-2 text-xs font-medium backdrop-blur-sm">
              {activePatientCount} active
            </span>
            <span className="rounded-xl bg-white/15 px-3 py-2 text-xs font-medium backdrop-blur-sm">
              {pendingInviteCount} pending invites
            </span>
            <span className="rounded-xl bg-white/15 px-3 py-2 text-xs font-medium backdrop-blur-sm">
              {stats.totalScans} scans
            </span>
          </div>
        </div>
      </section>

      {/* Stats overview */}
      <section aria-label="Overview statistics">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Overview
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardStatCard
            label="Active Patients"
            value={activePatientCount}
            accent="teal"
            icon={Users}
          />
          <DashboardStatCard
            label="Total Scans"
            value={stats.totalScans}
            accent="cyan"
            icon={ScanLine}
          />
          <DashboardStatCard
            label="Normal Cases"
            value={stats.normalScans}
            accent="emerald"
            icon={ShieldCheck}
          />
          <DashboardStatCard
            label="Pneumonia Cases"
            value={stats.pneumoniaScans}
            accent="rose"
            icon={Activity}
          />
          <DashboardStatCard
            label="COVID Cases"
            value={stats.covidScans}
            accent="amber"
            icon={Activity}
          />
          <DashboardStatCard
            label="Average Confidence"
            value={avgConfidence}
            sub="Across patient scans"
            accent="slate"
            icon={TrendingUp}
          />
        </div>
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Quick actions
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((item) => {
            const inner = (
              <>
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${item.accent}`}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold text-slate-900">
                    {item.label}
                  </span>
                  <span className="block text-xs text-slate-500">{item.description}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              </>
            );
            const className =
              "group flex w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200/60 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-900 dark:hover:border-teal-600/40 dark:hover:shadow-teal-950/30";

            if ("href" in item && item.href) {
              return (
                <Link key={item.label} href={item.href} className={className}>
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={openInvite}
                className={className}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </section>

      {/* Patient Invitations — separate from active patients */}
      <PatientInvitationsSection
        invitations={invitations}
        patientIdByEmail={resolvePatientIdByEmail}
        onInvite={openInvite}
        onResend={(id) => void handleResendInvitation(id)}
        onCancel={(id) => void handleCancelInvitation(id)}
        actionLoadingId={invitationActionId}
      />

      {/* My Patients — accepted portal users only */}
      <MyPatientsSection
        patients={patients}
        scanStats={scanStats}
        search={patientSearch}
        onSearchChange={setPatientSearch}
        onInvite={openInvite}
      />

      {/* Recent Scans */}
      <DashboardPanel
        eyebrow="Recent activity"
        title="Recent Scans"
        description="Latest AI-assisted chest X-ray screenings across your patients."
        icon={ScanLine}
        action={
          hasScans ? (
            <Link
              href="/history"
              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 transition hover:text-teal-800"
            >
              View all
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : undefined
        }
      >
        {!hasScans ? (
          <DashboardEmptyState
            icon={Upload}
            title="No scans analyzed yet"
            description="Upload a chest X-ray to run pneumonia screening, generate Grad-CAM heatmaps, and save results to patient history."
            className="min-h-[240px]"
            action={
              <Link href="/analyze" className="btn-primary">
                <Upload className="h-4 w-4" aria-hidden />
                Analyze X-Ray
              </Link>
            }
            secondaryAction={
              activePatientCount > 0 ? (
                <Link href="/history" className="btn-secondary">
                  <History className="h-4 w-4" aria-hidden />
                  View history
                </Link>
              ) : (
                <button type="button" onClick={openInvite} className="btn-secondary">
                  <MailPlus className="h-4 w-4" aria-hidden />
                  Invite a patient
                </button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.recentScans.map((scan) => {
              const isAbnormal = scan.prediction !== "Normal";
              return (
                <Link
                  key={scan.id}
                  href={`/scans/${scan.id}`}
                  className="group flex gap-3.5 overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-r from-white to-slate-50/70 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200/80 hover:shadow-md dark:border-slate-700/80 dark:from-slate-900 dark:to-slate-950 dark:shadow-black/20 dark:hover:border-teal-500/40 dark:hover:shadow-teal-950/30"
                >
                  <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-800/40">
                    <StudyImage
                      src={scan.imagePath}
                      alt=""
                      fill
                      objectFit="cover"
                      className="opacity-90 transition duration-300 group-hover:scale-105"
                      sizes="128px"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-0.5 pr-1">
                    <p className="truncate font-semibold capitalize text-slate-900 dark:text-slate-100">
                      {scan.patientName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(scan.createdAt)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PredictionBadge label={scan.prediction} />
                      <SeverityBadge severity={scan.severity} />
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1",
                          isAbnormal
                            ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/40"
                            : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/40",
                        )}
                      >
                        {formatPercent(scan.confidence)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </DashboardPanel>

      <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-sm sm:px-6 dark:border-slate-700/80 dark:bg-slate-900/80">
        <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-sm">
          <span className="font-semibold text-slate-700">XRaySense AI</span> stores
          screening results on your workspace. AI outputs support clinical review—they are
          not a final diagnosis.
        </p>
      </section>

      {inviteModalOpen ? (
        <InvitePatientModal
          onClose={() => setInviteModalOpen(false)}
          onSuccess={handleInviteSuccess}
        />
      ) : null}
    </div>
  );
}
