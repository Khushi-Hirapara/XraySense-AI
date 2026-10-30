import Link from "next/link";
import { FileText } from "lucide-react";
import { DownloadReportButton } from "@/components/DownloadReportButton";
import { PageHeader } from "@/components/PageHeader";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { PredictionBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { MedicalDisclaimer } from "@/components/ui/MedicalDisclaimer";
import { fetchScanById, fetchScans } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export const metadata = {
  title: "Reports",
};

interface ReportsPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { id } = await searchParams;

  if (id) {
    try {
      const scan = await fetchScanById(id);
      return (
        <div className="page-shell">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <PageHeader
              title="Diagnostic Report"
              description={`Report for ${scan.patientName}`}
            />

            <Card className="mx-auto max-w-3xl space-y-6 shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                    XRaySense AI
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Chest X-Ray Analysis Report
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Scan #{scan.id} · {formatDate(scan.createdAt)}
                  </p>
                </div>
                <DownloadReportButton scanId={scan.id} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">Patient</p>
                  <p className="font-semibold text-slate-900">{scan.patientName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Scan ID</p>
                  <p className="font-mono text-sm text-slate-700">{scan.id}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <PredictionBadge label={scan.prediction} />
                <div className="min-w-[200px] flex-1">
                  <ConfidenceBar value={scan.confidence} />
                </div>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">
                  Recommendation
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {scan.recommendation}
                </p>
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                    Chest X-ray
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={scan.imagePath}
                    alt="Chest X-ray"
                    className="aspect-square w-full object-contain bg-slate-50 p-2"
                  />
                </div>
                {scan.heatmapPath && (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                      Grad-CAM overlay
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={scan.heatmapPath}
                      alt="Grad-CAM heatmap"
                      className="aspect-square w-full object-contain bg-slate-50 p-2"
                    />
                  </div>
                )}
              </div>

              <MedicalDisclaimer />
            </Card>

            <p className="mt-6 text-center">
              <Link
                href="/history"
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                ← Back to scan history
              </Link>
            </p>
          </div>
        </div>
      );
    } catch {
      return (
        <div className="page-shell">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <PageHeader
              title="Report not found"
              description="This scan id does not exist or the backend is unavailable."
            />
            <Link href="/history" className="btn-secondary mt-4 inline-flex">
              ← Back to scan history
            </Link>
          </div>
        </div>
      );
    }
  }

  let scans: Awaited<ReturnType<typeof fetchScans>> = [];
  let listError: string | null = null;
  try {
    scans = await fetchScans();
  } catch {
    listError =
      "Could not load reports. Start the backend at http://localhost:8000.";
  }

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          title="Reports"
          description="Open a diagnostic summary or download a PDF from a saved scan."
        />

        {listError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {listError}
          </div>
        )}

        {scans.length === 0 && !listError && (
          <Card className="py-14 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
            <p className="text-sm font-medium text-slate-700">No reports yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Analyze an X-ray first—each run creates a report you can open here.
            </p>
            <Link href="/analyze" className="btn-primary mt-6 inline-flex">
              Analyze X-Ray
            </Link>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scans.map((scan) => (
            <Card
              key={scan.id}
              className="flex flex-col gap-4 transition hover:border-teal-200/60 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{scan.patientName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(scan.createdAt)}
                  </p>
                </div>
              </div>
              <PredictionBadge label={scan.prediction} />
              <p className="line-clamp-3 flex-1 text-sm text-slate-600">
                {scan.recommendation}
              </p>
              <Link
                href={`/reports?id=${scan.id}`}
                className="text-sm font-semibold text-teal-700 hover:text-teal-800"
              >
                Open report →
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
