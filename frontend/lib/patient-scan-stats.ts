import type { PatientRecord } from "@/lib/patients";
import type { ScanRecord } from "@/lib/types";

export interface PatientScanStats {
  totalScans: number;
  lastScanAt: string | null;
  lastScanId: string | null;
}

export function buildPatientScanStatsMap(
  patients: PatientRecord[],
  scans: ScanRecord[],
): Map<number, PatientScanStats> {
  const map = new Map<number, PatientScanStats>();

  for (const patient of patients) {
    map.set(patient.id, {
      totalScans: 0,
      lastScanAt: null,
      lastScanId: null,
    });
  }

  const nameToId = new Map<string, number>();
  for (const patient of patients) {
    nameToId.set(patient.name.trim().toLowerCase(), patient.id);
  }

  const sorted = [...scans].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const scan of sorted) {
    let patientId = scan.patientId;
    if (patientId == null) {
      const matched = nameToId.get(scan.patientName.trim().toLowerCase());
      if (matched == null) continue;
      patientId = matched;
    }
    if (!map.has(patientId)) {
      map.set(patientId, { totalScans: 0, lastScanAt: null, lastScanId: null });
    }
    const stats = map.get(patientId)!;
    stats.totalScans += 1;
    if (!stats.lastScanAt) {
      stats.lastScanAt = scan.createdAt;
      stats.lastScanId = scan.id;
    }
  }

  return map;
}

export function findPatientIdByEmail(
  patients: PatientRecord[],
  email: string,
): number | null {
  const normalized = email.trim().toLowerCase();
  const match = patients.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}
