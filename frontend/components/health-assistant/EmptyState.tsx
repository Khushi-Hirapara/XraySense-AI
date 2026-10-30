"use client";

import {
  BookOpen,
  ClipboardList,
  HeartPulse,
  MessageSquareHeart,
  Stethoscope,
} from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
          <MessageSquareHeart className="h-8 w-8" aria-hidden />
        </div>
        <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-white health-pulse-ring" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
        Welcome to XRaySense AI Health Assistant
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Ask about your saved screening report. I explain results, medical terms,
        recovery tips, and doctor notes. I do not diagnose or replace your clinician.
      </p>
      <ul className="mt-6 grid w-full max-w-lg gap-2 text-left sm:grid-cols-2">
        {[
          { icon: ClipboardList, label: "Your reports" },
          { icon: BookOpen, label: "Medical terms" },
          { icon: HeartPulse, label: "Recovery guidance" },
          { icon: Stethoscope, label: "Recommendations & notes" },
        ].map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 text-sm text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
              <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
