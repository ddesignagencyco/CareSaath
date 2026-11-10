import clsx from "clsx";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "bg-ink-50 text-ink-600 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-500/20",
  success: "bg-success-50 text-success-700 ring-success-600/20",
  warning: "bg-warning-50 text-warning-800 ring-warning-600/25",
  danger: "bg-danger-50 text-danger-700 ring-danger-600/20",
  info: "bg-info-50 text-info-700 ring-info-600/20",
  accent: "bg-accent-50 text-accent-700 ring-accent-500/25",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-400",
  brand: "bg-brand-500",
  success: "bg-success-600",
  warning: "bg-warning-600",
  danger: "bg-danger-600",
  info: "bg-info-600",
  accent: "bg-accent-500",
};

export function Badge({
  tone = "neutral",
  dot,
  pulse,
  className,
  children,
}: {
  tone?: Tone;
  /** Show a leading status dot. */
  dot?: boolean;
  /** Animate the dot with a soft pulse — for live/in-progress states (e.g. "on the way"). */
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          {pulse && (
            <span className={clsx("absolute inline-flex size-full animate-ping rounded-full opacity-75", DOT[tone])} />
          )}
          <span className={clsx("relative inline-flex size-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}
