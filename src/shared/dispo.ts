// Les disponibilités sont écrites librement (« mardi midi, jeudi après 17h », « le soir », « tout le temps »).
// On en tire des créneaux jour × moment pour former les équipes et proposer un horaire ; le texte reste affiché tel quel.

export const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
export const PERIODS = ["matin", "midi", "aprem", "soir"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_NAMES: Record<Period, string> = { matin: "Matin", midi: "Midi", aprem: "Après-midi", soir: "Soir" };
// Bornes horaires de chaque moment, en heures.
const RANGES: Record<Period, [number, number]> = { matin: [7, 12], midi: [12, 14], aprem: [14, 18], soir: [18, 24] };

export type Dispo = { any: boolean; slots: string[] }; // slots : « 1:midi » = mardi midi

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const DAY_WORDS: [RegExp, number[]][] = [
  [/\blun(di)?\b/, [0]],
  [/\bmar(di)?\b/, [1]],
  [/\bmer(credi)?\b/, [2]],
  [/\bjeu(di)?\b/, [3]],
  [/\bven(dredi)?\b/, [4]],
  [/\bsam(edi)?\b/, [5]],
  [/\bdim(anche)?\b/, [6]],
  [/\b(en )?semaine\b/, [0, 1, 2, 3, 4]],
  [/\b(week-?end|we)\b/, [5, 6]],
  [/\btous les jours\b|\bchaque jour\b/, [0, 1, 2, 3, 4, 5, 6]],
];
const PERIOD_WORDS: [RegExp, Period[]][] = [
  [/\bmatin(ee)?s?\b/, ["matin"]],
  [/\bmidi\b|\bdej(euner)?\b|\bpause\b/, ["midi"]],
  [/\bapres[- ]?midi\b|\baprem\b|\bapm\b|\bap\b/, ["aprem"]],
  [/\bsoir(ee)?s?\b|\bnuit\b/, ["soir"]],
  [/\bjournee\b/, ["matin", "midi", "aprem"]],
];
const ANY = /tout le temps|n.?importe|quand (vous|tu) (voulez|veux)|toujours|peu importe|indifferent|tout(es)? (les )?(heures|horaires)|full dispo|dispo tout|libre tout/;

const hour = (h: string, m?: string) => Number(h) + (m ? Number(m) / 60 : 0);
const overlapping = (from: number, to: number) => PERIODS.filter((p) => RANGES[p][0] < to && RANGES[p][1] > from);

function periodsOf(clause: string): Period[] {
  const out = new Set<Period>();
  for (const [re, ps] of PERIOD_WORDS) if (re.test(clause)) ps.forEach((p) => out.add(p));
  // « 12h-14h », « de 12h a 14h », « entre 12h et 14h »
  const range = /(\d{1,2})\s*h\s*(\d{2})?\s*(?:-|a|à|jusqu.?a|et)\s*(\d{1,2})\s*h?\s*(\d{2})?/.exec(clause);
  if (range) overlapping(hour(range[1], range[2]), hour(range[3], range[4])).forEach((p) => out.add(p));
  else {
    const from = /(?:apres|a partir de|des|depuis|plus tard que)\s*(\d{1,2})\s*h\s*(\d{2})?/.exec(clause);
    const until = /(?:avant|jusqu.?a)\s*(\d{1,2})\s*h\s*(\d{2})?/.exec(clause);
    // « après 17h » : on garde un moment s'il en reste au moins une heure et demie
    if (from) PERIODS.filter((p) => RANGES[p][1] - Math.max(RANGES[p][0], hour(from[1], from[2])) >= 1.5).forEach((p) => out.add(p));
    if (until) overlapping(7, hour(until[1], until[2])).forEach((p) => out.add(p));
    if (!from && !until) {
      for (const m of clause.matchAll(/(\d{1,2})\s*h\s*(\d{2})?/g)) overlapping(hour(m[1], m[2]), hour(m[1], m[2]) + 1).forEach((p) => out.add(p));
    }
  }
  return [...out];
}

export function parseDispo(text: string): Dispo {
  const t = fold(text || "");
  if (!t.trim()) return { any: false, slots: [] };
  if (ANY.test(t)) return { any: true, slots: allSlots() };
  const slots = new Set<string>();
  // Une virgule, « et », un point-virgule ou une ligne séparent les morceaux : « mardi midi, jeudi soir ».
  const clauses = t.split(/[,;/\n+]|\bet\b|\bou\b/).map((c) => c.trim()).filter(Boolean);
  // « mardi et jeudi soir » : un jour sans moment attend le morceau suivant ; seul au bout, il compte pour la journée.
  let pending: number[] = [];
  for (const c of clauses) {
    const days = new Set<number>();
    for (const [re, ds] of DAY_WORDS) if (re.test(c)) ds.forEach((d) => days.add(d));
    const periods = periodsOf(c);
    if (!periods.length) { if (days.size) pending.push(...days); continue; }
    const target = days.size ? [...days, ...pending] : pending.length ? pending : [0, 1, 2, 3, 4, 5, 6];
    for (const d of target) for (const p of periods) slots.add(`${d}:${p}`);
    pending = [];
  }
  for (const d of pending) for (const p of PERIODS) slots.add(`${d}:${p}`);
  return { any: false, slots: [...slots].sort(slotOrder) };
}

export const allSlots = () => DAYS.flatMap((_, d) => PERIODS.map((p) => `${d}:${p}`));
const slotOrder = (a: string, b: string) => {
  const [da, pa] = a.split(":"), [db, pb] = b.split(":");
  return Number(da) - Number(db) || PERIODS.indexOf(pa as Period) - PERIODS.indexOf(pb as Period);
};
export const slotLabel = (key: string) => {
  const [d, p] = key.split(":");
  return `${DAY_NAMES[Number(d)]} ${PERIOD_NAMES[p as Period].toLowerCase()}`;
};

// Un résumé court : « mar midi · jeu soir », « tous les jours, soir », « lun–ven, midi ».
export function summary(d: Dispo): string {
  if (d.any) return "Tout le temps";
  if (!d.slots.length) return "";
  const byDay = new Map<number, Period[]>();
  for (const s of d.slots) {
    const [day, p] = s.split(":");
    byDay.set(Number(day), [...(byDay.get(Number(day)) ?? []), p as Period]);
  }
  // les jours qui ont les mêmes moments vont ensemble
  const groups = new Map<string, number[]>();
  for (const [day, ps] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const k = ps.join(",");
    groups.set(k, [...(groups.get(k) ?? []), day]);
  }
  return [...groups].map(([k, days]) => {
    const ps = k.split(",") as Period[];
    const when = ps.length === 4 ? "" : ps.map((p) => PERIOD_NAMES[p].toLowerCase()).join(", ");
    let dayText: string;
    if (days.length === 7) dayText = "tous les jours";
    else if (days.join() === "0,1,2,3,4") dayText = "lun–ven";
    else if (days.join() === "5,6") dayText = "week-end";
    else dayText = days.map((x) => DAYS[x]).join(", ");
    return when ? `${dayText} ${when}` : dayText;
  }).join(" · ").replace(/^./, (c) => c.toUpperCase());
}

// Nombre de créneaux communs ; une dispo inconnue compte comme moyenne pour ne pas être mise de côté.
export function overlap(a: Dispo, b: Dispo): number {
  if (!a.slots.length || !b.slots.length) return 2;
  const set = new Set(a.slots);
  return b.slots.filter((s) => set.has(s)).length;
}
export function common(a: Dispo, b: Dispo): string[] {
  if (!a.slots.length) return b.slots;
  if (!b.slots.length) return a.slots;
  const set = new Set(a.slots);
  return b.slots.filter((s) => set.has(s));
}
