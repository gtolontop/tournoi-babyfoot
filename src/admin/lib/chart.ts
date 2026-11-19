// Shared arithmetic of the hand-written SVG charts (components/kit): curves, scales, ticks and French number formats.
// monotonePath and resample are adapted from EasyUI (MIT, Suraj Maurya; see docs/third-party.md).

// A smooth curve through the points that never overshoots the data (monotone cubic).
export function monotonePath(p: [number, number][]): string {
  const n = p.length;
  if (n < 2) return n ? `M${p[0][0]} ${p[0][1]}` : "";
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = (p[i + 1][1] - p[i][1]) / (dx[i] || 1e-9);
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(p[i][0] + h)} ${f(p[i][1] + t[i] * h)} ${f(p[i + 1][0] - h)} ${f(p[i + 1][1] - t[i + 1] * h)} ${f(p[i + 1][0])} ${f(p[i + 1][1])}`;
  }
  return d;
}

// The same series at a fixed number of points, so two periods can morph into each other.
export function resample(v: number[], n: number): number[] {
  if (!v.length) return Array(n).fill(0);
  if (v.length === 1) return Array(n).fill(v[0]);
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (v.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(v.length - 1, i0 + 1);
    return v[i0] + (v[i1] - v[i0]) * (x - i0);
  });
}

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// A round top for an axis: 0–1–2–5 steps; at least 1, so an all-zero series still draws a flat line at the bottom.
export function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const r = max / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
}

const fr = new Intl.NumberFormat("fr-FR");
const fr1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const num = (n: number) => fr.format(Math.round(n));
// 1 234 → « 1,2 k » where room is short (axes, chips).
export const compact = (n: number) => (Math.abs(n) >= 10_000 ? `${fr1.format(n / 1000)} k` : num(n));
export const pct = (x: number) => `${Math.abs(x) >= 10 || x === 0 ? Math.round(x) : fr1.format(x)} %`;
// Euros from cents, without decimals: « 1 290 € ».
export const eur = (cents: number) => `${num(cents / 100)} €`;

// « 12 nov. » from YYYY-MM-DD, at noon UTC so no time zone moves the day.
export const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
// Times as the founder reads them, in Paris whatever the browser: « 13 nov. », « 15 h 40 », « 9 h ».
const paris = (t: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...o }).format(t);
export const parisDay = (t: number) => paris(t, { day: "numeric", month: "short" });
export const parisClock = (t: number) => paris(t, { hour: "numeric", minute: "2-digit" }).replace(":", " h ").replace(/ h 00$/, " h");
const at = (t: number) => `${parisDay(t)} ${parisClock(t)}`;
const plural = (n: number, one: string, many: string) => `${num(n)} ${n > 1 ? many : one}`;

// What a point of a two-week curve covers: 24 hours ending at `end`. The last one is the last 24 hours.
// « du 12 nov. 15 h 40 au 13 nov. 15 h 40 », « 24 dernières heures, depuis hier 15 h 40 ».
export function windowLabel(ends: number[], i: number) {
  const end = ends[i];
  const start = end - 86400_000;
  if (i === ends.length - 1) return `24 dernières heures, depuis hier ${parisClock(start)}`;
  return `du ${at(start)} au ${at(end)}`;
}
// Its reads, in plain words: « 419 lectures réussies »; with failures or reads put off, each one named:
// « 52 réussies · 121 en échec · 3 400 non tentées ».
export function windowReads(ok: number, failed = 0, idle = 0) {
  if (!failed && !idle) return plural(ok, "lecture réussie", "lectures réussies");
  return [plural(ok, "réussie", "réussies"), failed && `${num(failed)} en échec`, idle && plural(idle, "non tentée", "non tentées")].filter(Boolean).join(" · ");
}
// Days worth a look: what failed or was put off outweighs what came back, and is at least twice the source's usual
// (its median over the two weeks). A source that always fails half its pages is not marked every day; Facebook's
// 9 Nov, thousands of tasks parked at once, is.
export function oddWindows(ok: number[], failed: number[], idle: number[]): ("failed" | "idle" | null)[] {
  const miss = ok.map((_, i) => (failed[i] ?? 0) + (idle[i] ?? 0));
  const usual = [...miss].sort((a, b) => a - b)[Math.floor(miss.length / 2)] ?? 0;
  return ok.map((v, i) => (miss[i] >= Math.max(20, v, 2 * usual) ? ((failed[i] ?? 0) >= (idle[i] ?? 0) ? "failed" : "idle") : null));
}
// An update line, in its tooltip under « Mise à jour »: « 13 nov. 11 h 02 · Facebook : … », or the date alone when it has no title.
export const releaseLine = (r: { at: number; title: string | null }) => (r.title ? `${at(r.at)} · ${r.title}` : at(r.at));
export const shortMonth = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
