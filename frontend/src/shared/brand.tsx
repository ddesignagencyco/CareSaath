import clsx from "clsx";
import { useId } from "react";

/**
 * CareSaath mark. "Saath" means "together": two people (teal-white and
 * marigold) whose arms meet to form a heart, inside a soft teal tile.
 */
export function LogoMark({ className }: { className?: string }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 48 48" className={clsx("size-10", className)} role="img" aria-label="CareSaath">
      <defs>
        <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#238c7f" />
          <stop offset="1" stopColor="#123e3a" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gid}-bg)`} />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="13.25" fill="none" stroke="white" strokeOpacity="0.12" strokeWidth="1.5" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.6">
        {/* left person: head + arm/body forming the heart's left half */}
        <path d="M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8" stroke="white" />
        {/* right person: mirrored half in marigold */}
        <path d="M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8" stroke="#f5b544" />
      </g>
      <circle cx="17" cy="9.6" r="3.3" fill="white" />
      <circle cx="31" cy="9.6" r="3.3" fill="#f5b544" />
    </svg>
  );
}

export function Logo({
  className,
  subtitle = "Admin",
  inverted,
}: {
  className?: string;
  subtitle?: string;
  inverted?: boolean;
}) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className={clsx("text-[19px] font-extrabold tracking-tight", inverted ? "text-white" : "text-ink-900")}>
          Care<span className={inverted ? "text-accent-400" : "text-brand-600"}>Saath</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={clsx("h-px w-3", inverted ? "bg-accent-400" : "bg-accent-500")} aria-hidden />
          <span className={clsx("text-[10px] font-bold tracking-[0.2em] uppercase", inverted ? "text-brand-100" : "text-ink-500")}>
            {subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}
