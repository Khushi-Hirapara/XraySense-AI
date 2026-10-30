import {
  BrainCircuit,
  FileCheck2,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { FeatureIcon } from "@/components/ui/FeatureIcon";

const points = [
  {
    icon: ScanSearch,
    tone: "sky" as const,
    title: "Focused chest X-ray screening",
    text: "XRaySense currently evaluates frontal chest radiographs for Normal versus Pneumonia patterns.",
  },
  {
    icon: BrainCircuit,
    tone: "violet" as const,
    title: "Explainable model output",
    text: "Confidence interpretation, Grad-CAM overlays, region labels, and affected-area estimates make results easier to review.",
  },
  {
    icon: FileCheck2,
    tone: "emerald" as const,
    title: "Structured clinical workflow",
    text: "Patient records, scan history, comparisons, notes, recommendations, and hospital-style PDF reports stay connected.",
  },
  {
    icon: ShieldCheck,
    tone: "amber" as const,
    title: "Built for responsible assistance",
    text: "Results support—not replace—qualified clinical interpretation. Access remains role-based and account-scoped.",
  },
];

export function HomeOverview() {
  return (
    <section className="border-y border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="w-full px-3 py-16 sm:px-5 sm:py-20 lg:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
            About the platform
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            What is XRaySense AI screening?
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-400">
            A modular medical-imaging workspace that turns a chest X-ray into an
            explainable screening result, a reviewable patient record, and a
            clear clinical report.
          </p>
        </div>

        <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {points.map(({ icon, tone, title, text }) => (
            <article key={title} className="group flex items-start gap-4">
              <FeatureIcon icon={icon} tone={tone} size="md" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
