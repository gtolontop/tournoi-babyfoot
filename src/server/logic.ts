// Les règles du tournoi : inscriptions, équipes, tableau, classement, et la vue envoyée à l'espace d'organisation.
import { common, overlap, parseDispo, slotLabel, summary, DAYS, DAY_NAMES, PERIODS, PERIOD_NAMES, type Dispo } from "../shared/dispo.ts";
import type { Contact, ContactKind, Estimate, Format, Match, Player, Team, View } from "../shared/types.ts";
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

const dispoCache = new Map<string, Dispo>();
export function dispoOf(p?: Player): Dispo {
  if (!p) return { any: false, slots: [] };
  let d = dispoCache.get(p.dispo);
  if (!d) { d = parseDispo(p.dispo); dispoCache.set(p.dispo, d); }
  return d;
}
const teamDispo = (t: Team): Dispo => {
  const a = P(t.a), b = P(t.b);
  if (!a || !b) return dispoOf(a || b);
  return { any: false, slots: common(dispoOf(a), dispoOf(b)) };
};

/* ---------- Contact ---------- */

export function readContact(kind: unknown, value: unknown): Contact | null {
  const v = clean(value, 80);
  if (!v) return null;
  const k: ContactKind = kind === "tel" || kind === "email" ? kind : "insta";
  if (k === "email") must(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "L'adresse email n'a pas l'air valide.");
  if (k === "tel") must(/^[+\d][\d .()-]{6,}$/.test(v), "Le numéro n'a pas l'air valide.");
  if (k === "insta") must(/^@?[\w.]{1,30}$/.test(v), "Le pseudo Instagram n'a pas l'air valide.");
  return { kind: k, value: k === "insta" ? v.replace(/^@/, "") : v };
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
  const contact = readContact(d.contactKind, d.contact);
  const dispo = clean(d.dispo, 200);
  must(state.players.length < 2000, "Trop d'inscriptions.");

  const key = norm(`${first} ${last}`);
  const existing = state.players.find((p) => norm(`${p.first} ${p.last}`) === key);
  if (existing) {
    // Son coéquipier l'avait inscrit : il complète sa fiche.
    must(existing.by === "partner" && !existing.confirmed, `${first} ${last} est déjà inscrit. Si c'est une erreur, préviens l'organisation.`);
    Object.assign(existing, { dispo: dispo || existing.dispo, contact: contact ?? existing.contact, confirmed: true });
    logEvent(`${fullName(existing)} a confirmé son inscription`);
    save();
    const m = mateOf(existing.id);
    return { title: "Inscription confirmée", text: m ? `${fullName(m)} t'avait déjà inscrit.` : "Ta fiche est à jour.", lines: recap(existing) };
  }

  const me: Player = { id: uid(6), first, last, contact, dispo, by: "self", confirmed: true, absent: false, at: Date.now() };
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
      if (!mate) {
        mate = { id: uid(6), first: mf, last: ml, contact: null, dispo, by: "partner", confirmed: false, absent: false, at: Date.now() };
        state.players.push(mate);
      }
      state.teams.push({ id: uid(6), a: me.id, b: mate.id, name: "", origin: "duo", at: Date.now() });
    }
    logEvent(`${fullName(me)} s'est inscrit avec ${fullName(mate)}`);
  } else logEvent(`${fullName(me)} s'est inscrit seul`);
  save();
  return { title: "Inscription envoyée", text: duo ? "Vous êtes inscrits tous les deux. On vous recontacte pour l'horaire." : "On te trouve un coéquipier et on te recontacte pour l'horaire.", lines: recap(me) };
}

const CONTACT_LABEL: Record<ContactKind, string> = { insta: "Instagram", tel: "Téléphone", email: "Email" };
function recap(p: Player): [string, string][] {
  const out: [string, string][] = [["Joueur", fullName(p)]];
  const m = mateOf(p.id);
  out.push(["Coéquipier", m ? fullName(m) : "À trouver"]);
  if (p.contact) out.push([CONTACT_LABEL[p.contact.kind], p.contact.kind === "insta" ? "@" + p.contact.value : p.contact.value]);
  if (p.dispo) out.push(["Disponibilités", p.dispo]);
  return out;
}

/* ---------- Équipes ---------- */

export function cleanupTeams() {
  state.teams = state.teams.filter((t) => t.a || t.b || inTournament(t.id));
}

// Associe les joueurs seuls ; les incomplètes se complètent d'abord. Le moins disponible choisit en premier.
export function autoTeams() {
  const free = state.players.filter((p) => !p.absent && !teamOf(p.id));
  for (const t of state.teams) {
    if ((t.a && t.b) || inTournament(t.id) || !free.length) continue;
    const have = P(t.a || t.b);
    if (!have || have.absent) continue;
    free.sort((x, y) => overlap(dispoOf(y), dispoOf(have)) - overlap(dispoOf(x), dispoOf(have)));
    const m = free.shift()!;
    if (t.a) t.b = m.id; else t.a = m.id;
  }
  let made = 0;
  while (free.length >= 2) {
    free.sort((x, y) => (dispoOf(x).slots.length || 99) - (dispoOf(y).slots.length || 99));
    const p = free.shift()!;
    let best = 0;
    for (let i = 1; i < free.length; i++) if (overlap(dispoOf(p), dispoOf(free[i])) > overlap(dispoOf(p), dispoOf(free[best]))) best = i;
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
        if (m.a !== a || m.b !== b) Object.assign(m, { a, b, sa: null, sb: null, w: null, ff: false });
      }
      m.bye = false;
      if (r === 0 && m.a && !m.b) Object.assign(m, { w: "a", bye: true });
      if (r === 0 && !m.a && m.b) Object.assign(m, { w: "b", bye: true });
    }
  }
}

function standings() {
  const t = state.tournament!;
  const rows = new Map(t.teams.map((id) => [id, { id, name: teamName(T(id)), j: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0, pts: 0 }]));
  for (const m of t.matches) {
    const A = rows.get(m.a!), B = rows.get(m.b!);
    if (!A || !B || (!m.w && (m.sa == null || m.sb == null))) continue;
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
  const totalRounds = t.format === "elim" ? Math.max(...t.matches.map((m) => m.round)) + 1 : 0;
  const final = t.format === "elim" ? t.matches.find((m) => m.round === totalRounds - 1) : undefined;
  const real = t.matches.filter((m) => !m.bye && !(m.round === 0 && !m.a && !m.b));
  return {
    ...t,
    totalRounds,
    matches: t.matches.map((m) => ({ ...m, an: m.a ? teamName(T(m.a)) : null, bn: m.b ? teamName(T(m.b)) : null })),
    standings: t.format === "rr" ? standings() : null,
    champion: final?.w ? teamName(T(winnerOf(final))) : null,
    played: real.filter((m) => m.w || (m.sa != null && m.sb != null)).length,
    total: real.length,
  };
}

/* ---------- La vue ---------- */

export function view(sess: Session): View {
  const players = state.players.map((p) => {
    const t = teamOf(p.id), d = dispoOf(p);
    return { ...p, team: t?.id ?? null, mate: t ? fullName(mateOf(p.id)) : null, slots: d.slots, any: d.any, summary: summary(d) };
  });
  const teams = state.teams.map((t) => {
    const a = P(t.a), b = P(t.b), d = teamDispo(t);
    return { ...t, label: teamName(t), complete: !!(a && b), absent: !!(a?.absent || b?.absent), slots: d.slots, summary: summary(d), inTournament: inTournament(t.id) };
  });
  const ready = teams.filter((t) => t.complete && !t.absent);
  const present = players.filter((p) => !p.absent);
  const has = (p: (typeof players)[number], pred: (slot: string) => boolean) => p.slots.some(pred);
  const byPeriod = PERIODS.map((k) => ({ key: k, label: PERIOD_NAMES[k], players: present.filter((p) => has(p, (s) => s.endsWith(":" + k))).length }));
  const byDay = DAYS.map((_, i) => ({ key: String(i), label: DAY_NAMES[i], players: present.filter((p) => has(p, (s) => s.startsWith(i + ":"))).length }));
  const counts = new Map<string, number>();
  for (const t of ready) for (const s of t.slots) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
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
      solo: present.filter((p) => !p.team).length,
      duo: state.teams.filter((t) => t.origin === "duo").length,
      today: state.players.filter((p) => p.by !== "partner" && Date.now() - p.at < 86400000).length,
      noDispo: present.filter((p) => !p.slots.length).length,
    },
    byPeriod,
    byDay,
    best: top ? { slot: top[0], label: slotLabel(top[0]), teams: top[1] } : null,
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
