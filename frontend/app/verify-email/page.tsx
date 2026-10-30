"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import {
  AuthFooterLink,
  AuthFormCard,
} from "@/components/auth/AuthFormCard";
import {
  AuthApiError,
  resendVerificationRequest,
  verifyEmailRequest,
} from "@/lib/auth";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    token ? "verifying" : "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await verifyEmailRequest(token);
        if (!cancelled) {
          setStatus("success");
          setMessage(result);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            err instanceof AuthApiError
              ? err.message
              : "Could not verify this email link.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResendMessage(null);
    setIsResending(true);
    try {
      const result = await resendVerificationRequest(email.trim());
      setResendMessage(result);
    } catch (err) {
      setResendMessage(
        err instanceof AuthApiError
          ? err.message
          : "Could not resend verification email.",
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthFormCard
      title="Verify email"
      description="Confirm your account email to finish setting up XRaySense."
      footer={
        <AuthFooterLink
          prompt="Already verified?"
          href="/login"
          label="Sign in"
        />
      }
    >
      {status === "verifying" && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verifying your email…
        </div>
      )}

      {status === "success" && (
        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{message ?? "Email verified successfully."}</p>
        </div>
      )}

      {status === "error" && message && (
        <ErrorAlert title="Verification failed" message={message} />
      )}

      {(status === "idle" || status === "error") && (
        <form onSubmit={(e) => void handleResend(e)} className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            {token
              ? "Request a new verification email below."
              : "Enter your email to receive a verification link."}
          </p>
          {resendMessage && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {resendMessage}
            </div>
          )}
          <div>
            <label
              htmlFor="verify-email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="verify-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={isResending}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
            />
          </div>
          <button
            type="submit"
            disabled={isResending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isResending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" aria-hidden />
                Resend verification
              </>
            )}
          </button>
        </form>
      )}

      {status === "success" && (
        <p className="mt-4 text-center text-sm">
          <Link
            href="/login"
            className="font-semibold text-teal-700 hover:text-teal-800"
          >
            Continue to sign in
          </Link>
        </p>
      )}
    </AuthFormCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
