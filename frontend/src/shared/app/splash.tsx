"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { PageLoader } from "../ui/brand-loader";

/**
 * First-load splash. It is part of the server HTML, so the animated logo shows
 * immediately while JavaScript loads, then fades out shortly after hydration.
 * Route changes don't remount the root layout, so it only appears once.
 */
export function Splash() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");

  useEffect(() => {
    const fade = setTimeout(() => setPhase("fade"), 900);
    const gone = setTimeout(() => setPhase("gone"), 1300);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      className={clsx("fixed inset-0 z-[100] bg-white transition-opacity duration-400", phase === "fade" && "pointer-events-none opacity-0")}
      aria-hidden={phase === "fade"}
    >
      <PageLoader fullScreen />
    </div>
  );
}
