// L'état du tournoi : un seul fichier JSON, écrit de façon atomique (fichier temporaire puis renommage).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Contact, Link, LogLine, Player, Role, Settings, Team, Tournament } from "../shared/types.ts";

export type Session = { role: Role; label: string; linkId?: string; exp: number };
export type State = {
  v: 2;
  settings: Settings;
  players: Player[];
  teams: Team[];
  tournament: Tournament | null;
  links: Link[];
  sessions: Record<string, Session>;
  log: LogLine[];
  adminHash: string | null;
};

export const DATA_FILE = process.env.DATA_FILE || path.resolve("data/state.json");

export const uid = (n = 9) => crypto.randomBytes(n).toString("base64url");

const defaults = (): State => ({
  v: 2,
  settings: { name: "Tournoi de baby-foot", date: "", place: "", welcome: "", open: true, publicBoard: true, tables: 1, matchMinutes: 10, days: [0, 1, 2, 3, 4], lunchFrom: 12 * 60 + 10, lunchTo: 14 * 60 + 10 },
  players: [],
  teams: [],
  tournament: null,
  links: [],
  sessions: {},
  log: [],
  adminHash: null,
});

// La première version gardait des créneaux fixes et un contact libre : on garde les comptes et les accès, le texte
// des créneaux devient la disponibilité écrite.
function migrate(raw: any): State {
  const s = defaults();
  if (!raw || typeof raw !== "object") return s;
  if (raw.v === 2) return { ...s, ...raw, settings: { ...s.settings, ...raw.settings }, players: (raw.players ?? []).map((p: Player) => ({ ...p, lunch: p.lunch ?? {} })) };
  const labels = new Map<string, string>((raw.settings?.slots ?? []).map((x: any) => [x.id, x.label]));
  s.settings = { ...s.settings, days: s.settings.days, name: raw.settings?.name ?? s.settings.name, date: raw.settings?.date ?? "", place: raw.settings?.place ?? "", welcome: raw.settings?.subtitle ?? "", open: raw.settings?.open ?? true, publicBoard: raw.settings?.publicBoard ?? true, tables: raw.settings?.tables ?? 1, matchMinutes: raw.settings?.matchMinutes ?? 10 };
  s.players = (raw.players ?? []).map((p: any): Player => ({
    id: p.id, first: p.first, last: p.last, contact: guessContact(p.contact ?? ""), lunch: {},
    dispo: [...(p.slots ?? []).map((id: string) => labels.get(id)).filter(Boolean), p.note].filter(Boolean).join(", "),
    by: p.by ?? "self", confirmed: p.confirmed ?? true, absent: !!p.absent, at: p.at ?? Date.now(),
  }));
  s.teams = raw.teams ?? [];
  s.tournament = raw.tournament ?? null;
  s.links = raw.links ?? [];
  s.sessions = raw.sessions ?? {};
  s.log = raw.log ?? [];
  s.adminHash = raw.adminHash ?? null;
  return s;
}

export function guessContact(v: string): Contact | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes("@") && /\.[a-z]{2,}$/i.test(t)) return { kind: "email", value: t };
  if (/^[+\d][\d .-]{5,}$/.test(t)) return { kind: "tel", value: t };
  return { kind: "insta", value: t.replace(/^@/, "") };
}

export let state: State = defaults();

export function load() {
  try { state = migrate(JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); }
  catch { state = defaults(); }
}

let timer: NodeJS.Timeout | null = null;
export function save() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 40);
}
export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, DATA_FILE);
}
export const pending = () => timer !== null;

export function logEvent(text: string, who = "") {
  state.log.unshift({ at: Date.now(), text, who });
  if (state.log.length > 300) state.log.length = 300;
}

export function backup() {
  flush();
  fs.copyFileSync(DATA_FILE, DATA_FILE.replace(/\.json$/, `.backup-${Date.now()}.json`));
}
