"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals its children when scrolled into view (fade + rise). Falls back to
 * visible when IntersectionObserver is missing; CSS shows everything under
 * prefers-reduced-motion. Children stay server-rendered — only the wrapper is
 * a client component.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} data-reveal="" data-shown={shown ? "" : undefined} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={className}>
      {children}
    </Tag>
  );
}
