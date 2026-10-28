/**
 * CareSaath brand tokens, mirrored from the web app
 * (CareSath/frontend/src/shared/styles/theme.css).
 * Brand: deep "care" teal. Accent: marigold, used sparingly for live moments.
 * Ink: green-tinted neutrals so greys sit comfortably next to the teal.
 *
 * Every scale has a light and a dark palette with the same keys and roles:
 * ink 0 is always "surface" and ink 900 always "text", brand 50/100 are soft
 * fills and brand 800 is text on them, and so on. The exported scales are live
 * views of the active palette (see setActiveScheme), so code that reads them
 * while rendering follows dark mode. Module-level objects that capture colours
 * must be wrapped in themed() so they are rebuilt per scheme.
 */
export type Scheme = 'light' | 'dark';

const light = {
  brand: {
    50: '#edf8f6',
    100: '#d3efea',
    200: '#a8ded5',
    300: '#73c6b9',
    400: '#43a89a',
    500: '#238c7f',
    600: '#167267',
    700: '#135c54',
    800: '#134a45',
    900: '#123e3a',
    950: '#072522',
  },
  accent: {
    50: '#fff8eb',
    100: '#fdebc6',
    200: '#fbd88d',
    400: '#f5b544',
    500: '#ee9b1d',
    600: '#d27a12',
    700: '#ae5913',
  },
  ink: {
    0: '#ffffff',
    25: '#f7f9f8',
    50: '#f0f4f3',
    100: '#e4eae8',
    200: '#d2dad8',
    300: '#b2bdba',
    400: '#85918e',
    500: '#63706c',
    600: '#4b5754',
    700: '#38423f',
    800: '#242c2a',
    900: '#141a18',
  },
  feedback: {
    success50: '#ecfdf3',
    success200: '#bbf7d0',
    success600: '#15803d',
    success700: '#166534',
    warning50: '#fffbeb',
    warning200: '#fde68a',
    warning600: '#b45309',
    warning700: '#92400e',
    danger50: '#fef2f2',
    danger100: '#fee2e2',
    danger200: '#fecaca',
    danger300: '#fca5a5',
    danger500: '#ef4444',
    danger600: '#dc2626',
    danger700: '#b91c1c',
    info50: '#eff6ff',
    info200: '#bfdbfe',
    info600: '#2563eb',
    info700: '#1d4ed8',
  },
};

type Palette = typeof light;
type Shape<T> = { readonly [K in keyof T]: string };

/**
 * Dark mode: near-black green-tinted surfaces (not pure black, so cards and
 * borders still read), softened text, and brand/feedback hues lifted so text
 * keeps ~4.5:1 on dark surfaces and filled buttons keep white labels legible.
 */
const dark: { [S in keyof Palette]: Shape<Palette[S]> } = {
  brand: {
    50: '#10302c',
    100: '#163d38',
    200: '#1f544d',
    300: '#73c6b9',
    400: '#4fb5a7',
    500: '#3aa395',
    600: '#5cc0b2',
    700: '#25897d',
    800: '#93d9cd',
    900: '#0f3a35',
    950: '#062320',
  },
  accent: {
    50: '#2c2210',
    100: '#3b2d12',
    200: '#6e5220',
    400: '#f5b544',
    500: '#f0a530',
    600: '#f2ac3d',
    700: '#f7c56b',
  },
  ink: {
    0: '#161e1c',
    25: '#0d1312',
    50: '#1d2624',
    100: '#28322f',
    200: '#354240',
    300: '#4b5956',
    400: '#808d89',
    500: '#9ba7a3',
    600: '#b4beba',
    700: '#cad2cf',
    800: '#dfe5e3',
    900: '#eef2f1',
  },
  feedback: {
    success50: '#0f2a1c',
    success200: '#1d5a36',
    success600: '#1f9a4f',
    success700: '#5ad68a',
    warning50: '#2b220e',
    warning200: '#6a4f12',
    warning600: '#e0a33a',
    warning700: '#f3c46a',
    danger50: '#2e1616',
    danger100: '#3a1a1a',
    danger200: '#6b2626',
    danger300: '#8f3434',
    danger500: '#f26b6b',
    danger600: '#e5484d',
    danger700: '#ff8a8a',
    info50: '#121f36',
    info200: '#25407a',
    info600: '#6b9bff',
    info700: '#9dbcff',
  },
};

const semantic = (p: { brand: Shape<Palette['brand']>; accent: Shape<Palette['accent']>; ink: Shape<Palette['ink']>; feedback: Shape<Palette['feedback']> }, scheme: Scheme) => ({
  bg: p.ink[25],
  surface: p.ink[0],
  surfaceMuted: p.ink[50],
  border: p.ink[100],
  borderStrong: p.ink[200],
  text: p.ink[900],
  textMuted: p.ink[500],
  // ink500, not 400: small captions need 4.5:1 on white.
  textSubtle: p.ink[500],
  primary: p.brand[700],
  primaryPressed: scheme === 'dark' ? p.brand[500] : p.brand[800],
  primarySoft: p.brand[50],
  primaryText: scheme === 'dark' ? p.brand[600] : p.brand[700],
  // Always white: text and icons on teal / filled buttons.
  onPrimary: '#ffffff',
  live: p.accent[400],
  liveSoft: p.accent[50],
  danger: p.feedback.danger600,
  dangerSoft: p.feedback.danger50,
  focus: p.brand[500],
  /** Rings around avatars/dots that sit on a surface. */
  ring: p.ink[0],
  shadow: scheme === 'dark' ? '#000000' : '#141a18',
  /** Dim layer behind sheets. */
  scrim: scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(7,37,34,0.45)',
  /** Press ripple on surfaces. */
  ripple: scheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(19,92,84,0.12)',
});

const palettes = {
  light: { ...light, colors: semantic(light, 'light') },
  dark: { ...dark, colors: semantic(dark, 'dark') },
};

type Tokens = typeof palettes.light;

let active: Scheme = 'light';

export function activeScheme(): Scheme {
  return active;
}

/** Called by the settings provider before its children render. */
export function setActiveScheme(scheme: Scheme) {
  active = scheme;
}

/** Forwards every read (incl. spread / Object.keys) to whatever `current()` returns now. */
function liveView<T extends object>(current: () => T): T {
  return new Proxy({} as T, {
    get: (_, k) => current()[k as keyof T],
    has: (_, k) => k in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, k) => {
      const d = Object.getOwnPropertyDescriptor(current(), k);
      return d && { ...d, configurable: true };
    },
  });
}

const view = <K extends keyof Tokens>(key: K) => liveView(() => palettes[active][key] as Tokens[K]);

export const brand: Shape<Palette['brand']> = view('brand');
export const accent: Shape<Palette['accent']> = view('accent');
export const ink: Shape<Palette['ink']> = view('ink');
export const feedback: Shape<Palette['feedback']> = view('feedback');
/** Semantic roles used by components. Screens should prefer these. */
export const colors: Shape<Tokens['colors']> = view('colors');

/**
 * The light brand scale in both schemes, for brand chrome that is teal on
 * purpose (headers, hero cards, status strips, the logo).
 */
export const brandFixed = light.brand;
export const accentFixed = light.accent;
export const inkFixed = light.ink;

/**
 * Module-level styles/maps that read colours: `themed(() => StyleSheet.create({...}))`.
 * Built lazily once per scheme; reads always return the active scheme's copy.
 */
export function themed<T extends object>(make: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return liveView(() => (cache[active] ??= make()));
}
