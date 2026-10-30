"use client";

import { ModelEvaluationView } from "@/components/model-evaluation/ModelEvaluationView";

export default function ModelEvaluationPage() {
  return (
    <div className="doctor-dashboard-shell flex min-h-screen flex-1 flex-col">
      <ModelEvaluationView />
    </div>
  );
}
