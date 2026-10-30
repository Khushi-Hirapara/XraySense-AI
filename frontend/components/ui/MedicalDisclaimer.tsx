import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicalDisclaimerProps {
  className?: string;
  compact?: boolean;
}

export function MedicalDisclaimer({ className, compact }: MedicalDisclaimerProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/45 dark:text-amber-100",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        className,
      )}
    >
      <ShieldAlert
        className={cn(
          "shrink-0 text-amber-600 dark:text-amber-400",
          compact ? "h-4 w-4" : "h-5 w-5",
        )}
        aria-hidden
      />
      <p className="leading-relaxed">
        XRaySense AI provides AI-assisted preliminary screening only-not a final
        medical diagnosis. Always follow guidance from qualified healthcare
        professionals.
      </p>
    </div>
  );
}
