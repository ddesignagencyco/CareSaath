import { SetupShell } from "@/features/caregiver/components/shell/setup-shell";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupShell>{children}</SetupShell>;
}
