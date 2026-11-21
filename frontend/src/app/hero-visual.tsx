/**
 * Clean photorealistic editorial hero frame for the CareSaath landing page.
 * No floating badges or AI-style stickers obscuring the photography.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="relative overflow-hidden rounded-[1.75rem] bg-brand-950 shadow-2xl shadow-brand-950/40 ring-1 ring-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-home-care.jpg"
          alt="A verified Pakistani registered nurse gently checking blood pressure for an elderly patient at home"
          className="aspect-[4/3.5] w-full object-cover object-center transition-transform duration-700 hover:scale-[1.02]"
        />
      </div>
    </div>
  );
}
