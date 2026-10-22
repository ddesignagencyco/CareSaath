import { ShieldCheck } from "lucide-react";

export function MockHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex items-start justify-center gap-2 rounded-xl bg-accent-50 px-3 py-2.5 text-xs text-accent-700 ring-1 ring-accent-400/30">
      <ShieldCheck className="mt-px size-4 shrink-0" />
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
