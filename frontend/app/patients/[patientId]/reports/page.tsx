"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { patientReportsPath } from "@/lib/patients";

/** Legacy path — redirect to doctor-scoped patient reports. */
export default function LegacyPatientReportsRedirect() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.patientId;
  const patientId = Number.parseInt(
    Array.isArray(rawId) ? rawId[0] : String(rawId ?? ""),
    10,
  );

  useEffect(() => {
    if (Number.isFinite(patientId) && patientId >= 1) {
      router.replace(patientReportsPath(patientId));
    }
  }, [patientId, router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">
      Opening patient reports…
    </div>
  );
}
