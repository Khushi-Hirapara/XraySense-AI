"use client";

import { useParams } from "next/navigation";
import { DoctorPatientReportsView } from "@/components/patients/DoctorPatientReportsView";

export default function DoctorPatientReportsPage() {
  const params = useParams();
  const rawId = params.patientId;
  const patientId = Number.parseInt(
    Array.isArray(rawId) ? rawId[0] : String(rawId ?? ""),
    10,
  );

  if (!Number.isFinite(patientId) || patientId < 1) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">
        Invalid patient.
      </div>
    );
  }

  return (
    <div className="doctor-dashboard-shell flex min-h-screen flex-1 flex-col">
      <DoctorPatientReportsView patientId={patientId} />
    </div>
  );
}
