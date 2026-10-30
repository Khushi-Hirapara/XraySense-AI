import {
  Activity,
  CheckCircle2,
  FileText,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { StudyImage } from "@/components/ui/StudyImage";

const findings = [
  "Pneumonia-like opacity pattern detected.",
  "Primary activation in the right lower lung.",
  "No image-quality limitation identified.",
];

const nextSteps = [
  "Correlate with symptoms and clinical examination.",
  "Request qualified radiology review.",
];

/** Decorative XRaySense workspace preview using illustrative, non-patient data. */
export function DashboardPreview() {
  return (
    <div className="home-dashboard-preview relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-teal-300/30 via-cyan-200/15 to-sky-200/25 blur-3xl dark:from-teal-500/25 dark:via-cyan-500/10 dark:to-sky-600/15"
        aria-hidden
      />

      <div className="dashboard-preview-shell relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-teal-950/10 ring-1 ring-slate-200/70 dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-teal-950/40 dark:ring-teal-500/20">
        {/* Header — always dark chrome like a real app window */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-3.5 py-3 text-white sm:px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-md shadow-teal-500/30 ring-1 ring-teal-300/40">
              <Activity className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-tight text-white">
                XRaySense AI
              </p>
              <p className="text-[8px] text-slate-400">
                Clinical review workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[8px] text-slate-400 sm:gap-4">
            <span>
              STUDY{" "}
              <b className="ml-1 font-semibold text-slate-100">PA Chest</b>
            </span>
            <span className="hidden sm:inline">
              MODULE{" "}
              <b className="ml-1 font-semibold text-slate-100">Pneumonia</b>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300 ring-1 ring-emerald-400/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153)]" />
              Complete
            </span>
          </div>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-teal-400 via-cyan-400 to-sky-500" />

        <div className="grid sm:grid-cols-[0.9fr_1.1fr]">
          {/* Left column */}
          <div className="border-b border-slate-100 bg-slate-50/80 p-3 sm:border-b-0 sm:border-r sm:border-slate-100 sm:p-4 dark:border-slate-800 dark:bg-slate-900/60 dark:sm:border-slate-800">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Study image
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25">
                <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                Quality passed
              </span>
            </div>

            <div className="relative aspect-[4/5] max-h-[300px] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-slate-800/20 dark:ring-slate-700/80">
              <StudyImage
                src="/carevision-demo-chest-xray.png"
                alt="Synthetic frontal chest X-ray in the XRaySense review workspace"
                fill
                priority
                objectFit="contain"
                className="opacity-95"
                sizes="(max-width: 640px) 90vw, 260px"
              />
              <span className="absolute bottom-2 left-2 rounded-md bg-slate-950/80 px-2 py-1 text-[8px] font-medium text-white backdrop-blur ring-1 ring-white/10">
                PA chest · illustrative study
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-3 shadow-sm dark:border-teal-500/25 dark:from-teal-500/15 dark:to-emerald-500/10 dark:shadow-teal-950/20">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-teal-200">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-teal-400/20 dark:text-teal-300 dark:ring-teal-400/30">
                    <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  </span>
                  Simplified explanation
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-slate-950/50 dark:text-teal-200 dark:ring-teal-400/20">
                  Decision support
                </span>
              </div>
              <p className="mt-2 text-[9px] leading-relaxed text-emerald-950 dark:text-slate-200">
                The model found an opacity pattern that may be consistent with
                pneumonia. A clinician should review the study and symptoms.
              </p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-3.5 bg-white p-3 sm:p-4 dark:bg-slate-950/40">
            <section>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgb(14_165_233)] dark:bg-sky-400 dark:shadow-[0_0_8px_rgb(56_189_248)]" />
                  AI screening findings
                </p>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[8px] font-medium text-sky-700 ring-1 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20">
                  3 findings
                </span>
              </div>
              <ol className="mt-2 space-y-1.5">
                {findings.map((finding, index) => (
                  <li
                    key={finding}
                    className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-2.5 py-2 dark:border-sky-500/20 dark:bg-sky-500/10"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-sky-100 text-[8px] font-bold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-400/20 dark:text-sky-200 dark:ring-sky-400/30">
                      {index + 1}
                    </span>
                    <p className="text-[9px] leading-relaxed text-slate-700 dark:text-slate-200">
                      {finding}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgb(251_191_36)]" />
                Impression
              </p>
              <div className="mt-2 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/80 p-2.5 dark:border-amber-400/25 dark:from-amber-500/15 dark:to-orange-500/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-white shadow-sm dark:bg-amber-400 dark:text-amber-950">
                    Primary
                  </span>
                  <p className="text-[9px] font-semibold text-amber-950 dark:text-amber-100">
                    Pneumonia pattern suspected
                  </p>
                </div>
                <p className="mt-1.5 text-[8px] leading-relaxed text-amber-900/80 dark:text-amber-100/75">
                  Right lower lung localization · moderate AI severity
                </p>
              </div>
            </section>

            <section>
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(16_185_129)] dark:bg-emerald-400 dark:shadow-[0_0_8px_rgb(52_211_153)]" />
                Next steps & recommendations
              </p>
              <div className="mt-2 space-y-1.5">
                {nextSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 dark:border-emerald-400/20 dark:bg-emerald-500/10"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/20 dark:text-emerald-300 dark:ring-emerald-400/30">
                      <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                    </span>
                    <p className="text-[8px] leading-relaxed text-emerald-950 dark:text-slate-200">
                      {index + 1}. {step}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-xl border border-slate-200 bg-slate-950 px-2 py-2.5 text-center dark:border-teal-400/20 dark:bg-slate-900">
                <p className="text-[7px] font-semibold uppercase tracking-wide text-slate-400">
                  Confidence
                </p>
                <p className="mt-0.5 text-xs font-bold text-teal-300">92%</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-2 py-2.5 text-center dark:border-rose-400/25 dark:bg-rose-500/10">
                <p className="text-[7px] font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-300">
                  Affected
                </p>
                <p className="mt-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                  18%
                </p>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-2 py-2.5 text-center dark:border-cyan-400/25 dark:bg-cyan-500/10">
                <p className="text-[7px] font-semibold uppercase tracking-wide text-teal-600 dark:text-cyan-300">
                  Heatmap
                </p>
                <p className="mt-0.5 text-xs font-bold text-teal-800 dark:text-cyan-300">
                  89%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid border-t border-slate-100 bg-slate-50/80 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 sm:border-b-0 sm:border-r sm:border-slate-100 dark:border-slate-800 dark:sm:border-slate-800">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-400/30">
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            <p className="text-[9px] leading-snug text-slate-600 dark:text-slate-300">
              Ask AI about confidence, regions, and next steps
            </p>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-500/20 dark:text-teal-300 dark:ring-teal-400/30">
              <FileText className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            <p className="text-[9px] font-medium leading-snug text-slate-700 dark:text-slate-200">
              Hospital-style PDF report ready
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
        Illustrative XRaySense workflow — not a live patient study
      </p>
    </div>
  );
}
