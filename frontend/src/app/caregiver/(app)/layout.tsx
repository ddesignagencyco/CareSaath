import { Suspense } from "react";
import { PageLoader } from "@shared/ui/brand-loader";
import { AppShell } from "@/features/caregiver/components/shell/app-shell";

/** Static placeholder while the shell's URL-dependent parts stream in. */
function ShellFallback() {
  return (
    <div className="min-h-dvh lg:ps-64">
      <aside className="fixed inset-y-0 start-0 hidden w-64 border-e border-ink-100 bg-white lg:block" />
      <div className="h-14 border-b border-ink-100 bg-white lg:h-16" />
      <PageLoader />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
