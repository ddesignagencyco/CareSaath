import clsx from "clsx";

/**
 * Animated CareSaath mark. The two halves of the heart ("saath" = together)
 * draw up from the bottom point and meet at the top, the two heads pop in,
 * the heart beats once, then it loops. Keyframes live in theme.css
 * (.cs-loader-*); prefers-reduced-motion shows the static mark.
 */
export function BrandLoader({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={clsx("cs-loader size-16", className)} role="img" aria-label={label}>
      <rect width="48" height="48" rx="14" className="fill-brand-700" />
      <g className="cs-loader-heart" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.6">
        <path
          className="cs-loader-line"
          pathLength={1}
          d="M24 38 C16.5 32.5 11 27.8 11 22.4 C11 18.6 13.8 16.2 17 16.2 C20 16.2 22.6 18 24 20.8"
          stroke="white"
        />
        <path
          className="cs-loader-line"
          pathLength={1}
          d="M24 38 C31.5 32.5 37 27.8 37 22.4 C37 18.6 34.2 16.2 31 16.2 C28 16.2 25.4 18 24 20.8"
          stroke="#f5b544"
        />
      </g>
      <circle className="cs-loader-head" cx="17" cy="9.6" r="3.3" fill="white" />
      <circle className="cs-loader-head" cx="31" cy="9.6" r="3.3" fill="#f5b544" />
    </svg>
  );
}

/** Centered loader with the wordmark; fills its container (or the screen). */
export function PageLoader({ className, fullScreen }: { className?: string; fullScreen?: boolean }) {
  return (
    <div className={clsx("grid place-items-center", fullScreen ? "min-h-dvh" : "min-h-[50vh]", className)}>
      <div className="flex flex-col items-center gap-4">
        <BrandLoader />
        <div className="cs-loader-word text-lg font-extrabold tracking-tight text-ink-900" dir="ltr" aria-hidden>
          Care<span className="text-brand-600">Saath</span>
        </div>
      </div>
    </div>
  );
}
