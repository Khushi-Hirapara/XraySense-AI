"use client";

import { DatasetEdaView } from "@/components/dataset-eda/DatasetEdaView";

export default function DatasetEdaPage() {
  return (
    <div className="doctor-dashboard-shell flex min-h-screen flex-1 flex-col">
      <DatasetEdaView />
    </div>
  );
}
