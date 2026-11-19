// Les règles du tournoi : inscriptions, équipes, tableau, classement, calage des matchs sur les pauses du midi, et la
// vue envoyée à l'espace d'organisation.
import { cleanLunch, DAY_NAMES, fmt, fromServices, intersect, SLOT, steps, summary, total, type Lunch, type Range, type Window } from "../shared/lunch.ts";
import type { Contact, Estimate, Format, Match, Player, Team, View } from "../shared/types.ts";
import { logEvent, save, state, uid, type Session } from "./store.ts";

export class UserError extends Error {}
export function must(cond: unknown, msg: string): asserts cond { if (!cond) throw new UserError(msg); }

export const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const clean = (s: unknown, max = 60) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const cap = (s: unknown) => clean(s, 40).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export const P = (id: string | null | undefined) => (id ? state.players.find((p) => p.id === id) : undefined);
export const T = (id: string | null | undefined) => (id ? state.teams.find((t) => t.id === id) : undefined);
export const fullName = (p?: Player) => (p ? `${p.first} ${p.last}` : "—");
export const teamOf = (pid: string) => state.teams.find((t) => t.a === pid || t.b === pid);
export const mateOf = (pid: string) => { const t = teamOf(pid); return t ? P(t.a === pid ? t.b : t.a) : undefined; };
export const inTournament = (tid: string) => !!state.tournament?.teams.includes(tid);

export function teamName(t?: Team) {
  if (!t) return "—";
  if (t.name) return t.name;
  return [P(t.a)?.first, P(t.b)?.first].filter(Boolean).join(" & ") || "Équipe";
}

/* ---------- Pauses du midi ---------- */

export const readLunch = (raw: unknown) => cleanLunch(raw, state.settings.days, state.settings.lunchFrom, state.settings.lunchTo);
const lunchOf = (p?: Player): Lunch => p?.lunch ?? {};
const members = (t?: Team) => [P(t?.a), P(t?.b)].filter(Boolean) as Player[];
export const teamWindows = (t?: Team): Window[] => { const m = members(t); return m.length ? intersect(...m.map(lunchOf)) : []; };
export const matchWindows = (m: Match): Window[] => {
  const ps = [...members(T(m.a)), ...members(T(m.b))];
  return ps.length ? intersect(...ps.map(lunchOf)).filter((w) => state.settings.days.includes(w.day)) : [];
};
// Minutes communes : sert à associer les joueurs seuls. Sans pause renseignée, on ne le met pas de côté.
const overlap = (a: Player, b: Player) => {
  if (!Object.keys(a.lunch ?? {}).length || !Object.keys(b.lunch ?? {}).length) return 30;
  return total(intersect(a.lunch, b.lunch));
};

/* ---------- Contact : un seul champ, on reconnaît ce que c'est ---------- */

export function readContact(value: unknown): Contact | null {
  const v = clean(value, 80);
  if (!v) return null;
  if (v.includes("@") && /\.[a-z]{2,}$/i.test(v) && !v.startsWith("@")) {
    must(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "L'adresse email n'a pas l'air valide.");
    return { kind: "email", value: v.toLowerCase() };
  }
  const digits = v.replace(/[\s.()-]/g, "");
  if (/^\+?\d{6,15}$/.test(digits)) return { kind: "tel", value: v };
  const handle = v.replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  must(/^[\w.]{1,30}$/.test(handle), "Contact non reconnu : un pseudo Instagram, un numéro ou un email.");
  return { kind: "insta", value: handle };
}

/* ---------- Inscription ---------- */

export type Recap = { title: string; text: string; lines: [string, string][] };

export function register(d: Record<string, unknown>): Recap {
  must(state.settings.open, "Les inscriptions sont fermées.");
  if (d.website) return { title: "Inscription envoyée", text: "", lines: [] }; // robot
  const first = cap(d.first), last = cap(d.last);
  must(first && last, "Indique ton prénom et ton nom.");
  const duo = d.mode === "duo";
  const mf = cap(d.mfirst), ml = cap(d.mlast);
  if (duo) must(mf && ml, "Indique le prénom et le nom de ton coéquipier.");
  if (duo) must(norm(mf + ml) !== norm(first + last), "Ton coéquipier ne peut pas être toi.");
  const contact = readContact(d.contact);
  const lunch = lunchField(d, "lunch", "l");
  const mlunch = lunchField(d, "mlunch", "m");
  const note = clean(d.note, 300);
  must(state.players.length < 2000, "Trop d'inscriptions.");

  const key = norm(`${first} ${last}`);
  const existing = state.players.find((p) => norm(`${p.first} ${p.last}`) === key);
  if (existing) {
    // Son coéquipier l'avait inscrit : il complète sa fiche avec ses propres horaires.
    must(existing.by === "partner" && !existing.confirmed, `${first} ${last} est déjà inscrit. Si c'est une erreur, préviens l'organisation.`);
    Object.assign(existing, { lunch, contact: contact ?? existing.contact, note: note || existing.note, confirmed: true });
    logEvent(`${fullName(existing)} a confirmé son inscription`);
    save();
    const m = mateOf(existing.id);
    return { title: "Inscription confirmée", text: m ? `${fullName(m)} t'avait déjà inscrit. Tes horaires sont à jour.` : "Ta fiche est à jour.", lines: recap(existing) };
  }

  const me: Player = { id: uid(6), first, last, contact, lunch, dispo: "", note, by: "self", confirmed: true, absent: false, at: Date.now() };
  state.players.push(me);
  if (duo) {
    let mate = state.players.find((p) => p.id !== me.id && norm(`${p.first} ${p.last}`) === norm(`${mf} ${ml}`));
    const mateTeam = mate && teamOf(mate.id);
    if (mate && mateTeam) {
      const other = P(mateTeam.a === mate.id ? mateTeam.b : mateTeam.a);
      if (other) {
        logEvent(`${fullName(me)} voulait jouer avec ${fullName(mate)}, déjà avec ${fullName(other)}`);
        save();
        return { title: "Inscription envoyée", text: `${fullName(mate)} est déjà en équipe avec quelqu'un d'autre. L'organisation te recontacte.`, lines: recap(me) };
      }
      if (mateTeam.a) mateTeam.b = me.id; else mateTeam.a = me.id;
    } else {
      // Le coéquipier garde les horaires donnés pour lui ; il pourra les corriger en s'inscrivant lui-même.
      if (!mate) {
        mate = { id: uid(6), first: mf, last: ml, contact: null, lunch: mlunch, dispo: "", by: "partner", confirmed: false, absent: false, at: Date.now() };
        state.players.push(mate);
      }
      state.teams.push({ id: uid(6), a: me.id, b: mate.id, name: "", origin: "duo", at: Date.now() });
    }
    logEvent(`${fullName(me)} s'est inscrit avec ${fullName(mate)}`);
  } else logEvent(`${fullName(me)} s'est inscrit seul`);
  save();
  return {
    title: "Inscription envoyée",
    text: duo ? `On a noté vos horaires à tous les deux. On vous dit quand vous jouez.` : "On te trouve un coéquipier et on te dit quand tu joues.",
    lines: recap(me),
  };
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
// Avec le script : { jour: [début, fin] }. Sans script : les cases {p}{jour} cochées, une par service.
function lunchField(d: Record<string, unknown>, key: string, p: string) {
  const v = d[key];
  if (v) return readLunch(typeof v === "string" ? safeJson(v) : v);
  const raw: Record<number, Range> = {};
  for (let i = 0; i < 5; i++) {
    const r = fromServices([d[`${p}${i}`]].flat().filter((x) => x !== "" && x != null).map(Number));
    if (r) raw[i] = r;
  }
  return readLunch(raw);
}

function recap(p: Player): [string, string][] {
  const out: [string, string][] = [["Joueur", fullName(p)]];
  const m = mateOf(p.id);
  out.push(["Coéquipier", m ? fullName(m) : "À trouver"]);
  if (p.contact) out.push(["Contact", p.contact.kind === "insta" ? "@" + p.contact.value : p.contact.value]);
  for (const [d, r] of Object.entries(p.lunch)) out.push([DAY_NAMES[Number(d)], `${fmt(r![0])} – ${fmt(r![1])}`]);
  if (!Object.keys(p.lunch).length) out.push(["Horaires", "Non renseignés"]);
  if (p.note) out.push(["Autre chose", p.note]);
  return out;
}

/* ---------- Équipes ---------- */

export function cleanupTeams() {
  state.teams = state.teams.filter((t) => t.a || t.b || inTournament(t.id));
}

// Associe les joueurs seuls selon leurs pauses communes ; les incomplètes se complètent d'abord. Le joueur qui mange
// le moins souvent au lycée choisit en premier.
export function autoTeams() {
  const free = state.players.filter((p) => !p.absent && !teamOf(p.id));
  for (const t of state.teams) {
    if ((t.a && t.b) || inTournament(t.id) || !free.length) continue;
    const have = P(t.a || t.b);
    if (!have || have.absent) continue;
    free.sort((x, y) => overlap(y, have) - overlap(x, have));
    const m = free.shift()!;
    if (t.a) t.b = m.id; else t.a = m.id;
  }
  let made = 0;
  const freeTime = (p: Player) => total(intersect(p.lunch)) || 9999;
  while (free.length >= 2) {
    free.sort((x, y) => freeTime(x) - freeTime(y));
    const p = free.shift()!;
    let best = 0;
    for (let i = 1; i < free.length; i++) if (overlap(p, free[i]) > overlap(p, free[best])) best = i;
    const q = free.splice(best, 1)[0];
    state.teams.push({ id: uid(6), a: p.id, b: q.id, name: "", origin: "auto", at: Date.now() });
    made++;
  }
  return { made, left: free.length };
}

/* ---------- Tableau ---------- */

const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };
function seedOrder(size: number) {
  let order = [1];
  while (order.length < size) { const n = order.length * 2; order = order.flatMap((s) => [s, n + 1 - s]); }
  return order;
}

export function generate(format: Format, ids: string[], shuffle: boolean) {
  let list = ids.filter((id) => T(id));
  must(list.length >= 2, "Il faut au moins 2 équipes complètes.");
  if (shuffle) list = list.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const matches: Match[] = [];
  if (format === "rr") {
    const l: (string | null)[] = [...list];
    if (l.length % 2) l.push(null);
    const n = l.length;
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = l[i], b = l[n - 1 - i];
        if (a && b) matches.push({ id: uid(5), round: r, a, b, sa: null, sb: null, w: null });
      }
      l.splice(1, 0, l.pop()!);
    }
  } else {
    const size = nextPow2(list.length);
    const slots = seedOrder(size).map((s) => list[s - 1] ?? null);
    for (let r = 0; r < Math.log2(size); r++) {
      for (let i = 0; i < size / 2 ** (r + 1); i++) {
        matches.push({ id: uid(5), round: r, pos: i, a: r ? null : slots[i * 2], b: r ? null : slots[i * 2 + 1], sa: null, sb: null, w: null });
      }
    }
  }
  state.tournament = { id: uid(5), format, teams: list, matches, at: Date.now() };
  resolve();
}

const winnerOf = (m?: Match) => (m?.w ? (m.w === "a" ? m.a : m.b) : null);

// Recalcule l'arbre : les vainqueurs montent, les exempts passent, un résultat devenu faux s'efface.
export function resolve() {
  const t = state.tournament;
  if (!t || t.format !== "elim") return;
  const rounds: Match[][] = [];
  for (const m of t.matches) (rounds[m.round] ||= [])[m.pos!] = m;
  for (let r = 0; r < rounds.length; r++) {
    for (const m of rounds[r]) {
      if (r > 0) {
        const a = winnerOf(rounds[r - 1][m.pos! * 2]), b = winnerOf(rounds[r - 1][m.pos! * 2 + 1]);
        if (m.a !== a || m.b !== b) Object.assign(m, { a, b, sa: null, sb: null, w: null, ff: false, when: null });
      }
      m.bye = false;
      if (r === 0 && m.a && !m.b) Object.assign(m, { w: "a", bye: true });
      if (r === 0 && !m.a && m.b) Object.assign(m, { w: "b", bye: true });
    }
  }
}

const playable = (m: Match) => !!(m.a && m.b && !m.bye);
const done = (m: Match) => !!(m.w || (m.sa != null && m.sb != null));

// Cale les matchs à jouer sur les pauses du midi : le premier jour et la première heure où les quatre joueurs mangent
// en même temps assez longtemps, sans dépasser le nombre de tables. Un match déjà calé à la main garde son créneau.
export function plan(replan: boolean) {
  const t = state.tournament;
  must(t, "Pas de tournoi en cours.");
  const { tables, matchMinutes: mm, days } = state.settings;
  const todo = t.matches.filter((m) => playable(m) && !done(m));
  if (replan) for (const m of todo) m.when = null;
  const busy: { day: number; s: number; e: number; teams: string[] }[] = todo.filter((m) => m.when).map((m) => ({ day: m.when!.day, s: m.when!.start, e: m.when!.start + mm, teams: [m.a!, m.b!] }));
  let placed = 0, missing = 0;
  // Les matchs les plus difficiles d'abord : le moins de temps en commun.
  const queue = todo.filter((m) => !m.when).map((m) => ({ m, ws: matchWindows(m) })).sort((a, b) => total(a.ws) - total(b.ws));
  for (const { m, ws } of queue) {
    const find = (): { day: number; start: number } | null => {
      for (const d of days) for (const w of ws.filter((x) => x.day === d)) for (let s = w.s; s + mm <= w.e; s += 5) {
        const clash = busy.filter((b) => b.day === d && b.s < s + mm && b.e > s);
        if (clash.length < tables && !clash.some((b) => b.teams.includes(m.a!) || b.teams.includes(m.b!))) return { day: d, start: s };
      }
      return null;
    };
    const slot = find();
    m.when = slot;
    if (slot) { busy.push({ day: slot.day, s: slot.start, e: slot.start + mm, teams: [m.a!, m.b!] }); placed++; }
    else missing++;
  }
  return { placed, missing };
}

function standings() {
  const t = state.tournament!;
  const rows = new Map(t.teams.map((id) => [id, { id, name: teamName(T(id)), j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 0 }]));
  for (const m of t.matches) {
    const A = rows.get(m.a!), B = rows.get(m.b!);
    if (!A || !B || !done(m)) continue;
    A.j++; B.j++;
    A.bp += m.sa ?? 0; A.bc += m.sb ?? 0; B.bp += m.sb ?? 0; B.bc += m.sa ?? 0;
    if (m.w === "a") { A.v++; B.d++; A.pts += 3; } else if (m.w === "b") { B.v++; A.d++; B.pts += 3; } else { A.n++; B.n++; A.pts++; B.pts++; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.bp - y.bc - (x.bp - x.bc) || y.bp - x.bp);
}

export function estimate(format: Format, n: number): Estimate {
  const { tables, matchMinutes: mm } = state.settings;
  if (format === "elim") {
    const size = nextPow2(n);
    let minutes = Math.ceil((n - size / 2) / tables) * mm, rem = size / 2;
    while (rem > 1) { rem /= 2; minutes += Math.ceil(rem / tables) * mm; }
    return { matches: n - 1, minutes };
  }
  const rounds = n % 2 ? n : n - 1;
  return { matches: (n * (n - 1)) / 2, minutes: rounds * Math.ceil(Math.floor(n / 2) / tables) * mm };
}

export function roundName(r: number, total: number) {
  const left = total - r;
  return left === 1 ? "Finale" : left === 2 ? "Demi-finales" : left === 3 ? "Quarts" : left === 4 ? "Huitièmes" : `Tour ${r + 1}`;
}

export function tournamentView() {
  const t = state.tournament;
  if (!t) return null;
  const mm = state.settings.matchMinutes;
  const totalRounds = t.format === "elim" ? Math.max(...t.matches.map((m) => m.round)) + 1 : 0;
  const final = t.format === "elim" ? t.matches.find((m) => m.round === totalRounds - 1) : undefined;
  const real = t.matches.filter((m) => !m.bye && !(m.round === 0 && !m.a && !m.b));
  return {
    ...t,
    totalRounds,
    matches: t.matches.map((m) => {
      const windows = playable(m) ? matchWindows(m) : [];
      return { ...m, an: m.a ? teamName(T(m.a)) : null, bn: m.b ? teamName(T(m.b)) : null, windows, fits: windows.some((w) => w.e - w.s >= mm) };
    }),
    standings: t.format === "rr" ? standings() : null,
    champion: final?.w ? teamName(T(winnerOf(final))) : null,
    played: real.filter(done).length,
    total: real.length,
  };
}

/* ---------- La vue ---------- */

export function view(sess: Session): View {
  const { days, lunchFrom, lunchTo, matchMinutes: mm } = state.settings;
  const players = state.players.map((p) => {
    const t = teamOf(p.id);
    return { ...p, team: t?.id ?? null, mate: t ? fullName(mateOf(p.id)) : null, summary: summary(p.lunch), free: total(intersect(p.lunch)) };
  });
  const teams = state.teams.map((t) => {
    const a = P(t.a), b = P(t.b), common = teamWindows(t).filter((w) => days.includes(w.day));
    return { ...t, label: teamName(t), complete: !!(a && b), absent: !!(a?.absent || b?.absent), common, summary: summary(common), longest: Math.max(0, ...common.map((w) => w.e - w.s)), inTournament: inTournament(t.id) };
  });
  const ready = teams.filter((t) => t.complete && !t.absent);
  const present = state.players.filter((p) => !p.absent);

  // Joueurs libres à chaque quart d'heure, et le moment qui réunit le plus d'équipes complètes pour un match entier.
  const step = SLOT;
  const grid = steps(lunchFrom, lunchTo - step, step);
  const heat = {
    from: lunchFrom, to: lunchTo, step,
    days: days.map((d) => ({
      day: d,
      players: present.filter((p) => p.lunch[d]).length,
      counts: grid.map((m) => present.filter((p) => { const r = p.lunch[d]; return r && r[0] <= m && r[1] >= m + step; }).length),
    })),
  };
  let best: View["best"] = null;
  for (const d of days) {
    for (let s = lunchFrom; s + mm <= lunchTo; s += 5) {
      const n = ready.filter((t) => t.common.some((w) => w.day === d && w.s <= s && w.e >= s + mm)).length;
      if (n && (!best || n > best.teams)) best = { day: d, s, e: s + mm, teams: n };
    }
  }
  // Le créneau conseillé s'étend tant que le même nombre d'équipes reste disponible.
  if (best) {
    const b = best;
    const count = (s: number) => ready.filter((t) => t.common.some((w) => w.day === b.day && w.s <= s && w.e >= s + mm)).length;
    while (b.e + 5 <= lunchTo && count(b.e + 5 - mm) === b.teams) b.e += 5;
  }

  const n = ready.length;
  return {
    me: { role: sess.role, label: sess.label },
    publicUrl: PUBLIC_URL,
    settings: state.settings,
    players,
    teams,
    stats: {
      players: players.length,
      present: present.length,
      absent: players.length - present.length,
      teamsReady: n,
      solo: players.filter((p) => !p.absent && !p.team).length,
      duo: state.teams.filter((t) => t.origin === "duo").length,
      today: state.players.filter((p) => p.by !== "partner" && Date.now() - p.at < 86400000).length,
      noLunch: present.filter((p) => !Object.keys(p.lunch).length).length,
    },
    heat,
    best,
    suggestion: n < 2 ? null : {
      pick: n <= 5 ? "rr" : "elim",
      why: n <= 5 ? `Avec ${n} équipes, un championnat donne plusieurs matchs à chacun.` : `Avec ${n} équipes, l'élimination directe reste courte.`,
      elim: estimate("elim", n),
      rr: estimate("rr", n),
    },
    tournament: tournamentView(),
    links: sess.role === "admin" ? state.links.filter((l) => !l.revoked).map(({ passHash: _, ...l }) => l) : [],
    log: state.log.slice(0, 60),
  };
}

export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 8110}`).replace(/\/$/, "");
