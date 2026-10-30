/**
 * Original flat illustration for the hero: a caregiver beside a seated patient
 * inside a soft arch, in the CareSaath palette. Decorative only.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 540" className={className} role="img" aria-label="A caregiver visiting a patient at home" preserveAspectRatio="xMidYMax meet">
      {/* Arch backdrop */}
      <path d="M40 300 A220 220 0 0 1 480 300 V520 a16 16 0 0 1-16 16 H56 a16 16 0 0 1-16-16 Z" fill="#e4f4f0" />
      <path d="M40 300 A220 220 0 0 1 480 300 V320 H40 Z" fill="#d3efea" opacity="0.7" />
      {/* Sun / window light */}
      <circle cx="398" cy="150" r="26" fill="#f5b544" opacity="0.9" />
      <circle cx="398" cy="150" r="26" fill="none" stroke="#edc06a" strokeWidth="6" opacity="0.5" />

      {/* Floor shadow */}
      <ellipse cx="258" cy="470" rx="188" ry="26" fill="#bfe3da" opacity="0.7" />

      {/* Plant */}
      <g>
        <path d="M96 470 h46 l-7 -58 h-32 Z" fill="#d98a5a" />
        <path d="M119 412 C119 372 100 356 92 346 C112 352 122 372 122 404" fill="#2f8f7f" />
        <path d="M119 412 C119 368 140 352 150 342 C132 352 126 374 126 406" fill="#36a08e" />
        <path d="M119 414 C112 388 118 368 119 352 C122 372 126 392 124 414" fill="#2a8273" />
      </g>

      {/* Armchair */}
      <g>
        <rect x="150" y="360" width="150" height="110" rx="20" fill="#e79b63" />
        <rect x="150" y="360" width="34" height="112" rx="16" fill="#d98a52" />
        <rect x="266" y="360" width="34" height="112" rx="16" fill="#d98a52" />
        <rect x="170" y="340" width="112" height="60" rx="18" fill="#f2c14e" />
        <rect x="178" y="470" width="18" height="36" rx="6" fill="#c97b45" />
        <rect x="256" y="470" width="18" height="36" rx="6" fill="#c97b45" />
      </g>

      {/* Seated patient */}
      <g>
        <rect x="196" y="430" width="22" height="54" rx="11" fill="#5b6b86" />
        <rect x="234" y="430" width="22" height="54" rx="11" fill="#5b6b86" />
        <rect x="198" y="474" width="30" height="16" rx="8" fill="#3c4863" />
        <rect x="236" y="474" width="30" height="16" rx="8" fill="#3c4863" />
        <path d="M188 372 q38 -26 78 0 l6 66 q-45 18 -90 0 Z" fill="#7c8aa5" />
        <rect x="214" y="344" width="28" height="22" rx="10" fill="#e8b894" />
        <circle cx="228" cy="330" r="26" fill="#edc0a0" />
        <path d="M202 326 a26 26 0 0 1 52 0 q-26 -16 -52 0 Z" fill="#d7d7d7" />
        <circle cx="219" cy="330" r="3.4" fill="#3c4863" />
        <circle cx="238" cy="330" r="3.4" fill="#3c4863" />
      </g>

      {/* Caregiver (teal scrubs) */}
      <g>
        <rect x="330" y="430" width="24" height="64" rx="12" fill="#115e54" />
        <rect x="360" y="430" width="24" height="64" rx="12" fill="#115e54" />
        <rect x="330" y="486" width="34" height="16" rx="8" fill="#0f3d39" />
        <rect x="358" y="486" width="34" height="16" rx="8" fill="#0f3d39" />
        <path d="M322 352 q36 -22 72 0 l10 92 q-46 16 -92 0 Z" fill="#167267" />
        {/* arm reaching to patient */}
        <path d="M324 372 q-30 22 -42 56" fill="none" stroke="#167267" strokeWidth="20" strokeLinecap="round" />
        <circle cx="282" cy="430" r="11" fill="#c98b63" />
        {/* stethoscope */}
        <path d="M352 360 q-6 34 10 54" fill="none" stroke="#0f3d39" strokeWidth="4" strokeLinecap="round" />
        <circle cx="364" cy="416" r="7" fill="#0f3d39" />
        <rect x="344" y="338" width="28" height="22" rx="10" fill="#c98b63" />
        <circle cx="358" cy="322" r="24" fill="#d49a72" />
        <path d="M334 322 a24 24 0 0 1 48 0 q-6 -22 -24 -22 q-18 0 -24 22 Z" fill="#3a2e2a" />
        <path d="M382 316 q16 6 10 30 q-10 -4 -10 -30 Z" fill="#3a2e2a" />
        <circle cx="351" cy="322" r="3" fill="#3a2e2a" />
        <circle cx="367" cy="322" r="3" fill="#3a2e2a" />
      </g>

      {/* Medical bag */}
      <g>
        <rect x="410" y="452" width="62" height="46" rx="10" fill="#0f3d39" />
        <rect x="428" y="442" width="26" height="14" rx="7" fill="none" stroke="#0f3d39" strokeWidth="5" />
        <rect x="436" y="466" width="10" height="20" rx="2" fill="#f5b544" />
        <rect x="430" y="473" width="22" height="6" rx="2" fill="#f5b544" />
      </g>
    </svg>
  );
}
