"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import {
  AuthFooterLink,
  AuthFormCard,
} from "@/components/auth/AuthFormCard";
import { GuestOnly } from "@/components/auth/GuestOnly";
import { AuthApiError, resetPasswordRequest } from "@/lib/auth";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing a token. Request a new one.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPasswordRequest(token, password);
      router.replace("/login?reset=1");
    } catch (err) {
      setError(
        err instanceof AuthApiError
          ? err.message
          : "Could not reset password. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthFormCard
      title="Reset password"
      description="Choose a new password for your XRaySense account."
      footer={
        <AuthFooterLink
          prompt="Need a new link?"
          href="/forgot-password"
          label="Request reset"
        />
      }
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && <ErrorAlert title="Reset failed" message={error} />}
        {!token && (
          <ErrorAlert
            title="Invalid link"
            message="Open the reset link from your email, or request a new one."
          />
        )}

        <div>
          <label
            htmlFor="reset-password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            disabled={isSubmitting || !token}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
          />
        </div>

        <div>
          <label
            htmlFor="reset-confirm"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Confirm password
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            disabled={isSubmitting || !token}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" aria-hidden />
              Update password
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-slate-500">
        <Link href="/login" className="text-teal-700 hover:text-teal-800">
          Back to sign in
        </Link>
      </p>
    </AuthFormCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <GuestOnly>
        <ResetPasswordForm />
      </GuestOnly>
    </Suspense>
  );
}
