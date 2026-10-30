"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Shield,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import {
  acceptInvitation,
  fetchInvitationPreview,
  type InvitationPreview,
} from "@/lib/invitations";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { LoadingPanel } from "@/components/ui/LoadingPanel";
import { formatDate } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100";

function isInvitationValid(preview: InvitationPreview): boolean {
  return preview.status.toLowerCase() === "pending";
}

function formatExpiryStatus(expiresAt: string): string {
  const expires = new Date(expiresAt);
  const now = new Date();
  if (expires.getTime() <= now.getTime()) {
    return "Expired";
  }
  return `Valid until ${formatDate(expiresAt)}`;
}

function InvitationShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gradient-to-b from-teal-50/50 via-slate-50 to-white px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-lg shadow-teal-900/20">
            <Shield className="h-7 w-7" aria-hidden />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            XRaySense AI
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Patient portal invitation
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Secure access to your chest X-ray screening reports
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

function InvitationInvalidState({ message }: { message?: string }) {
  return (
    <InvitationShell>
      <div className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100">
            <AlertCircle className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-xl font-bold text-slate-900">
            Invitation expired or invalid
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
            {message ??
              "This invitation link is no longer valid. It may have expired or already been used."}
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            Please contact your doctor to request a new invitation email.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </InvitationShell>
  );
}

function InvitationPreviewCard({ preview }: { preview: InvitationPreview }) {
  const expiryLabel = formatExpiryStatus(preview.expiresAt);
  const isExpired = expiryLabel === "Expired";

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Invited by
          </p>
          <p className="font-semibold text-slate-900">{preview.doctorName}</p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Clock
          className={`mt-0.5 h-4 w-4 shrink-0 ${isExpired ? "text-rose-600" : "text-cyan-700"}`}
          aria-hidden
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Invitation status
          </p>
          <p
            className={
              isExpired ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"
            }
          >
            {expiryLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function InvitationSuccessState() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/login");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <InvitationShell>
      <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-xl font-bold text-slate-900">Account created</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
            Your patient portal account is ready. Sign in with the email from your
            invitation and the password you just created.
          </p>
          <p className="mt-4 text-xs text-slate-500">Redirecting to sign in…</p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Sign in now
          </Link>
        </div>
      </div>
    </InvitationShell>
  );
}

export function AcceptInvitationPageContent({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("Missing invitation token. Use the link from your email.");
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchInvitationPreview(token);
        if (!cancelled) {
          setPreview(data);
          if (data.patientName) {
            setName(data.patientName);
          }
          if (!isInvitationValid(data)) {
            setPreviewError(
              data.status.toLowerCase() === "accepted"
                ? "This invitation has already been accepted. Please sign in instead."
                : `This invitation is ${data.status}.`,
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(
            err instanceof Error ? err.message : "Invitation expired or invalid.",
          );
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token || !preview) {
      setError("Missing invitation details.");
      return;
    }
    if (!name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await acceptInvitation(token, {
        name: name.trim(),
        password,
        confirmPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not accept invitation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (previewLoading) {
    return (
      <InvitationShell>
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <LoadingPanel message="Verifying your invitation…" />
        </div>
      </InvitationShell>
    );
  }

  if (success) {
    return <InvitationSuccessState />;
  }

  if (previewError || !preview || !isInvitationValid(preview)) {
    return <InvitationInvalidState message={previewError ?? undefined} />;
  }

  return (
    <InvitationShell>
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-slate-900">Create your account</h2>
        <p className="mt-1 text-sm text-slate-600">
          Complete the form below to accept your invitation from{" "}
          <span className="font-medium text-slate-800">{preview.doctorName}</span>.
        </p>

        <InvitationPreviewCard preview={preview} />

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error ? <ErrorAlert title="Could not create account" message={error} /> : null}

          <div>
            <label
              htmlFor="accept-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="accept-email"
                type="email"
                readOnly
                value={preview.email}
                className={`${INPUT_CLASS} pl-10`}
                aria-describedby="accept-email-hint"
              />
            </div>
            <p id="accept-email-hint" className="mt-1.5 text-xs text-slate-500">
              This email is tied to your invitation and cannot be changed.
            </p>
          </div>

          <div>
            <label
              htmlFor="accept-name"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="accept-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              disabled={isSubmitting}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Your full name"
            />
          </div>

          <div>
            <label
              htmlFor="accept-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="accept-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              disabled={isSubmitting}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="mt-1.5 text-xs text-slate-500">At least 8 characters.</p>
          </div>

          <div>
            <label
              htmlFor="accept-confirm"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirm Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="accept-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              disabled={isSubmitting}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Creating account…
              </>
            ) : (
              <>
                <UserCheck className="h-4 w-4" aria-hidden />
                Accept invitation
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-teal-700 hover:text-teal-800">
            Sign in
          </Link>
        </p>
      </div>
    </InvitationShell>
  );
}
