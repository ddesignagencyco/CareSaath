"use client";

import { useEffect, useState } from "react";
import { HeroArt } from "./hero-art";

/**
 * Hero visual. Shows the original illustration by default, and swaps in a real
 * photo the moment one exists at `public/hero.jpg` (it preloads it and only
 * switches if it loads, so a missing file never shows a broken image).
 * Drop a licensed image at frontend/public/hero.jpg to use a real photo.
 */
export function HeroVisual({ className }: { className?: string }) {
  const [photo, setPhoto] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setPhoto(true);
    img.src = "/hero.jpg";
  }, []);

  if (!photo) return <HeroArt className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/hero.jpg" alt="A verified caregiver visiting a patient at home" className={`aspect-[4/5] w-full rounded-[1.5rem] object-cover ${className ?? ""}`} />
  );
}
