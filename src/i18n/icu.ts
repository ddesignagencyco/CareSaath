/**
 * Minimal ICU MessageFormat, enough for the CareSaath message files:
 *   {name}                              argument
 *   {n, plural, =0 {…} one {# x} other {# xs}}   plural with # = number
 *   {kind, select, A {…} other {…}}     select
 * Rich tags such as <b>…</b> are left in place for `splitRich` to handle.
 * Kept tiny on purpose; next-intl / formatjs would add weight for nothing.
 */
export type Values = Record<string, string | number | null | undefined>;

/** Index of the brace that closes the one at `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return i;
  }
  return src.length - 1;
}

/** "one {…} other {…}" -> { one: "…", other: "…" } */
function parseOptions(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) break;
    const key = body.slice(i, open).trim();
    const close = matchBrace(body, open);
    out[key] = body.slice(open + 1, close);
    i = close + 1;
  }
  return out;
}

function pluralCategory(n: number): string {
  // English and Urdu both split one / other.
  return n === 1 ? 'one' : 'other';
}

export function formatIcu(src: string, values: Values = {}, hash?: number): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '#' && hash !== undefined) {
      out += String(hash);
      i++;
      continue;
    }
    if (ch !== '{') {
      out += ch;
      i++;
      continue;
    }
    const close = matchBrace(src, i);
    const inner = src.slice(i + 1, close);
    const first = inner.indexOf(',');
    if (first < 0) {
      const v = values[inner.trim()];
      out += v == null ? '' : String(v);
    } else {
      const name = inner.slice(0, first).trim();
      const rest = inner.slice(first + 1);
      const second = rest.indexOf(',');
      const kind = (second < 0 ? rest : rest.slice(0, second)).trim();
      const options = second < 0 ? {} : parseOptions(rest.slice(second + 1));
      const raw = values[name];
      if (kind === 'plural') {
        const n = Number(raw ?? 0);
        const pick = options[`=${n}`] ?? options[pluralCategory(n)] ?? options.other ?? '';
        out += formatIcu(pick, values, n);
      } else if (kind === 'select') {
        const pick = options[String(raw)] ?? options.other ?? '';
        out += formatIcu(pick, values, hash);
      } else {
        out += raw == null ? '' : String(raw);
      }
    }
    i = close + 1;
  }
  return out;
}

export interface RichPart {
  text: string;
  bold: boolean;
}

/** "Code <b>123456</b> sent" -> plain and bold runs. Other tags are dropped. */
export function splitRich(text: string): RichPart[] {
  const parts: RichPart[] = [];
  const re = /<b>(.*?)<\/b>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false });
    parts.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.map(p => ({ ...p, text: p.text.replace(/<\/?[a-z]+>/g, '') }));
}

export const stripTags = (text: string) => text.replace(/<\/?[a-z]+>/g, '');
