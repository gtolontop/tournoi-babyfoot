// Ce que le serveur garde et ce que l'espace d'organisation reçoit.

export type ContactKind = "insta" | "tel" | "email";
export type Contact = { kind: ContactKind; value: string };

export type Player = {
  id: string;
  first: string;
  last: string;
  contact: Contact | null;
  dispo: string; // tel qu'écrit par le joueur
  by: "self" | "partner" | "staff";
  confirmed: boolean;
  absent: boolean;
  at: number;
};

export type Team = { id: string; a: string | null; b: string | null; name: string; origin: "duo" | "auto" | "manual"; at: number };

export type Match = {
  id: string;
  round: number;
  pos?: number;
  a: string | null;
  b: string | null;
  sa: number | null;
  sb: number | null;
  w: "a" | "b" | null;
  ff?: boolean;
  bye?: boolean;
  table?: string;
};

export type Format = "elim" | "rr";
export type Tournament = { id: string; format: Format; teams: string[]; matches: Match[]; at: number };

export type Settings = {
  name: string;
  date: string;
  place: string;
  welcome: string;
  open: boolean;
  publicBoard: boolean;
  tables: number;
  matchMinutes: number;
};

export type Role = "admin" | "manage" | "view";
export type Link = { id: string; token: string; label: string; role: Exclude<Role, "admin">; passHash: string; at: number; lastUsed?: number; revoked?: boolean };
export type LogLine = { at: number; text: string; who: string };

/* ---------- La vue envoyée au navigateur ---------- */

export type PlayerView = Player & { team: string | null; mate: string | null; slots: string[]; any: boolean; summary: string };
export type TeamView = Team & { label: string; complete: boolean; absent: boolean; slots: string[]; summary: string; inTournament: boolean };
export type MatchView = Match & { an: string | null; bn: string | null };
export type StandingRow = { id: string; name: string; j: number; v: number; n: number; d: number; bp: number; bc: number; pts: number };
export type TournamentView = Omit<Tournament, "matches"> & {
  matches: MatchView[];
  totalRounds: number;
  standings: StandingRow[] | null;
  champion: string | null;
  played: number;
  total: number;
};
export type Estimate = { matches: number; minutes: number };

export type View = {
  me: { role: Role; label: string };
  publicUrl: string;
  settings: Settings;
  players: PlayerView[];
  teams: TeamView[];
  stats: { players: number; present: number; absent: number; teamsReady: number; solo: number; duo: number; today: number; noDispo: number };
  // disponibilités : joueurs par moment et par jour, et le créneau qui réunit le plus d'équipes complètes
  byPeriod: { key: string; label: string; players: number }[];
  byDay: { key: string; label: string; players: number }[];
  best: { slot: string; label: string; teams: number } | null;
  suggestion: { pick: Format; why: string; elim: Estimate; rr: Estimate } | null;
  tournament: TournamentView | null;
  links: Omit<Link, "passHash">[];
  log: LogLine[];
};
