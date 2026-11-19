// La pause du midi de chaque joueur, jour par jour : « mardi je mange de 12h à 13h ». Les heures sont en minutes depuis
// minuit. On croise les pauses pour savoir quand une équipe, puis un match (quatre joueurs), peut jouer.

export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
export const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven"] as const;

export type Range = [number, number]; // [début, fin]
export type Lunch = Partial<Record<number, Range>>; // jour (0 = lundi) → pause
export type Window = { day: number; s: number; e: number };

export const fmt = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
export const SLOT = 60; // un service = une heure de cours
// Les services entre deux bornes : [12h10, 13h10], [13h10, 14h10].
export function services(from: number, to: number): Range[] {
  const out: Range[] = [];
  for (let m = from; m + SLOT <= to; m += SLOT) out.push([m, m + SLOT]);
  return out;
}
// Des services cochés (leurs heures de début) à la plage du jour ; deux services qui se suivent font deux heures.
export function fromServices(starts: number[]): Range | null {
  const s = [...new Set(starts.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
  return s.length ? [s[0], s[s.length - 1] + SLOT] : null;
}
export const fmtRange = (r: Range) => `${fmt(r[0])} – ${fmt(r[1])}`;
export const minutes = (a: number, b: number) => Math.max(0, b - a);

// Les horaires proposés dans le formulaire, entre deux bornes.
export const STEP = 10; // les horaires proposés vont de 10 en 10 minutes, comme les heures de cours (12h10, 13h10…)
export function steps(from: number, to: number, step = STEP) {
  const out: number[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  return out;
}

export function cleanLunch(raw: unknown, days: number[], from: number, to: number): Lunch {
  const out: Lunch = {};
  if (!raw || typeof raw !== "object") return out;
  for (const d of days) {
    const r = (raw as Record<string, unknown>)[d];
    if (!Array.isArray(r) || r.length !== 2) continue;
    const s = Math.round(Number(r[0])), e = Math.round(Number(r[1]));
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    const a = Math.max(from, Math.min(s, e)), b = Math.min(to, Math.max(s, e));
    if (b - a >= 15) out[d] = [a, b];
  }
  return out;
}

// Ce qui est commun à plusieurs pauses, jour par jour.
export function intersect(...ls: Lunch[]): Window[] {
  if (!ls.length) return [];
  const out: Window[] = [];
  for (let d = 0; d < 5; d++) {
    let s = -Infinity, e = Infinity;
    for (const l of ls) {
      const r = l[d];
      if (!r) { s = Infinity; break; }
      s = Math.max(s, r[0]);
      e = Math.min(e, r[1]);
    }
    if (e - s >= 1 && Number.isFinite(s)) out.push({ day: d, s, e });
  }
  return out;
}

export const total = (ws: Window[]) => ws.reduce((n, w) => n + w.e - w.s, 0);
export const hasLunch = (l: Lunch) => Object.keys(l).length > 0;

// « Mar 12h – 13h · Jeu 12h30 – 13h30 »
export function summary(ws: Window[] | Lunch): string {
  const list: Window[] = Array.isArray(ws) ? ws : Object.entries(ws).map(([d, r]) => ({ day: Number(d), s: r![0], e: r![1] }));
  return list.sort((a, b) => a.day - b.day).map((w) => `${DAY_SHORT[w.day]} ${fmt(w.s)}–${fmt(w.e)}`).join(" · ");
}
