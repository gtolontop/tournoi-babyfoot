// L'API de l'espace d'organisation. Chaque écriture renvoie la vue à jour : l'écran se redessine sans relire.
import { Hono } from "hono";
import QRCode from "qrcode";
import { backup, logEvent, save, state, uid, type Session } from "./store.ts";
import { checkPass, closeSession, genPass, hashPass, ipOf, limited, openSession, sessionOf } from "./auth.ts";
import { autoTeams, cap, cleanupTeams, clean, fullName, generate, must, norm, P, PUBLIC_URL, readContact, resolve, T, teamName, teamOf, UserError, view } from "./logic.ts";

type Env = { Variables: { sess: Session & { sid: string } } };
export const api = new Hono<Env>();

api.onError((e, c) => {
  if (e instanceof UserError) return c.json({ error: e.message }, 400);
  console.error(e);
  return c.json({ error: "Erreur serveur." }, 500);
});

api.post("/login", async (c) => {
  if (limited("login:" + ipOf(c), 10, 10 * 60_000)) return c.json({ error: "Trop d'essais. Réessaie dans 10 minutes." }, 429);
  const b = await c.req.json().catch(() => ({}));
  if (b.token) {
    const link = state.links.find((l) => l.token === b.token && !l.revoked);
    if (!link || !checkPass(String(b.password ?? "").trim().toLowerCase(), link.passHash)) return c.json({ error: "Mot de passe incorrect." }, 401);
    link.lastUsed = Date.now();
    openSession(c, { role: link.role, label: link.label, linkId: link.id });
    logEvent(`Connexion de « ${link.label} »`);
    return c.json({ ok: true });
  }
  if (!checkPass(b.password, state.adminHash)) return c.json({ error: "Mot de passe incorrect." }, 401);
  openSession(c, { role: "admin", label: "Admin" });
  return c.json({ ok: true });
});

// Un lien d'accès : le nom affiché sur l'écran de connexion.
api.get("/link/:token", (c) => {
  const link = state.links.find((l) => l.token === c.req.param("token") && !l.revoked);
  return link ? c.json({ label: link.label, name: state.settings.name }) : c.json({ error: "Ce lien n'existe pas ou a été révoqué." }, 404);
});
api.get("/meta", (c) => c.json({ name: state.settings.name }));

api.use("*", async (c, next) => {
  const sess = sessionOf(c);
  if (!sess) return c.json({ error: "Session expirée." }, 401);
  if (c.req.method !== "GET") {
    const origin = c.req.header("origin");
    if (origin && origin !== PUBLIC_URL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return c.json({ error: "Origine refusée." }, 403);
  }
  c.set("sess", sess);
  await next();
});

api.get("/state", (c) => c.json(view(c.var.sess)));

api.get("/qr", async (c) => {
  const text = c.req.query("text") || PUBLIC_URL + "/";
  must(text.length < 400, "Texte trop long.");
  if (c.req.query("format") === "png") {
    const buf = await QRCode.toBuffer(text, { width: 1200, margin: 2, errorCorrectionLevel: "M" });
    return c.body(new Uint8Array(buf), 200, { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="qr-inscription.png"' });
  }
  const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#141412", light: "#ffffff" } });
  return c.body(svg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=600" });
});

api.get("/export.csv", (c) => {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Prénom", "Nom", "Contact", "Type", "Équipe", "Coéquipier", "Disponibilités", "Absent", "Inscrit le"]];
  for (const p of state.players) {
    const t = teamOf(p.id);
    rows.push([p.first, p.last, p.contact?.value ?? "", p.contact?.kind ?? "", t ? teamName(t) : "", t ? fullName(P(t.a === p.id ? t.b : t.a)) : "", p.dispo, p.absent ? "oui" : "", new Date(p.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })]);
  }
  return c.body("﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n"), 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="inscriptions.csv"' });
});

// Les écritures : une fonction par route, la vue suit.
type Fn = (b: any, s: Session & { sid: string }) => unknown;
const edit = (fn: Fn): Fn => (b, s) => { must(s.role !== "view", "Accès en lecture seule."); return fn(b, s); };
const admin = (fn: Fn): Fn => (b, s) => { must(s.role === "admin", "Réservé à l'admin."); return fn(b, s); };

const writes: Record<string, Fn> = {
  "/settings": edit((b) => {
    const s = state.settings;
    if (b.name !== undefined) s.name = clean(b.name, 80) || s.name;
    if (b.date !== undefined) s.date = clean(b.date, 60);
    if (b.place !== undefined) s.place = clean(b.place, 80);
    if (b.welcome !== undefined) s.welcome = clean(b.welcome, 160);
    if (b.open !== undefined) s.open = !!b.open;
    if (b.publicBoard !== undefined) s.publicBoard = !!b.publicBoard;
    if (b.tables !== undefined) s.tables = Math.max(1, Math.min(20, Number(b.tables) || 1));
    if (b.matchMinutes !== undefined) s.matchMinutes = Math.max(2, Math.min(90, Number(b.matchMinutes) || 10));
  }),
  "/player": edit((b, s) => {
    const first = cap(b.first), last = cap(b.last);
    must(first && last, "Prénom et nom requis.");
    const contact = readContact(b.contactKind, b.contact);
    if (b.id) {
      const p = P(b.id);
      must(p, "Joueur introuvable.");
      Object.assign(p, { first, last, contact, dispo: clean(b.dispo, 200) });
      logEvent(`Fiche de ${fullName(p)} modifiée`, s.label);
      return;
    }
    must(!state.players.some((p) => norm(`${p.first} ${p.last}`) === norm(`${first} ${last}`)), "Ce joueur existe déjà.");
    const p = { id: uid(6), first, last, contact, dispo: clean(b.dispo, 200), by: "staff" as const, confirmed: true, absent: false, at: Date.now() };
    state.players.push(p);
    logEvent(`${fullName(p)} ajouté par l'organisation`, s.label);
    return { id: p.id };
  }),
  "/player/absent": edit((b, s) => {
    const p = P(b.id);
    must(p, "Joueur introuvable.");
    p.absent = !!b.absent;
    logEvent(`${fullName(p)} ${p.absent ? "absent" : "présent"}`, s.label);
  }),
  "/player/delete": edit((b, s) => {
    const p = P(b.id);
    must(p, "Joueur introuvable.");
    for (const t of state.teams) { if (t.a === p.id) t.a = null; if (t.b === p.id) t.b = null; }
    state.players = state.players.filter((x) => x.id !== p.id);
    cleanupTeams();
    logEvent(`${fullName(p)} supprimé`, s.label);
  }),
  "/teams/auto": edit((_, s) => {
    const r = autoTeams();
    logEvent(`${r.made} équipe${r.made > 1 ? "s" : ""} formée${r.made > 1 ? "s" : ""} automatiquement`, s.label);
    return r;
  }),
  "/team": edit((b, s) => {
    const a: string | null = b.a || null, bb: string | null = b.b || null;
    must(!a || P(a), "Joueur introuvable.");
    must(!bb || P(bb), "Joueur introuvable.");
    must(!a || a !== bb, "Choisis deux joueurs différents.");
    let t = b.id ? T(b.id) : undefined;
    if (b.id) must(t, "Équipe introuvable.");
    for (const pid of [a, bb]) {
      const o = pid && teamOf(pid);
      if (o && o !== t) { if (o.a === pid) o.a = null; if (o.b === pid) o.b = null; }
    }
    if (!t) {
      t = { id: uid(6), a, b: bb, name: clean(b.name, 40), origin: "manual", at: Date.now() };
      state.teams.push(t);
      logEvent(`Équipe ${teamName(t)} créée`, s.label);
    } else {
      const before = [t.a, t.b];
      Object.assign(t, { a, b: bb, name: clean(b.name ?? t.name, 40) });
      const out = before.filter((x) => x && x !== a && x !== bb).map((x) => fullName(P(x)));
      const inn = [a, bb].filter((x) => x && !before.includes(x)).map((x) => fullName(P(x)));
      logEvent(out.length && inn.length ? `${inn.join(", ")} remplace ${out.join(", ")} chez ${teamName(t)}` : `Équipe ${teamName(t)} modifiée`, s.label);
    }
    cleanupTeams();
  }),
  "/team/delete": edit((b, s) => {
    const t = T(b.id);
    must(t, "Équipe introuvable.");
    must(!state.tournament?.teams.includes(t.id), "Cette équipe joue le tournoi : remplace un joueur ou déclare forfait.");
    state.teams = state.teams.filter((x) => x.id !== t.id);
    logEvent(`Équipe ${teamName(t)} dissoute`, s.label);
  }),
  "/tournament": edit((b, s) => {
    const ids: string[] = Array.isArray(b.teams) && b.teams.length ? b.teams : state.teams.filter((t) => P(t.a) && P(t.b) && !P(t.a)!.absent && !P(t.b)!.absent).map((t) => t.id);
    generate(b.format === "rr" ? "rr" : "elim", ids, b.shuffle !== false);
    logEvent(`Tournoi lancé : ${b.format === "rr" ? "championnat" : "élimination directe"}, ${ids.length} équipes`, s.label);
  }),
  "/tournament/delete": edit((_, s) => { state.tournament = null; logEvent("Tournoi réinitialisé", s.label); }),
  "/tournament/swap": edit((b, s) => {
    const t = state.tournament;
    must(t && t.teams.includes(b.from) && T(b.to) && !t.teams.includes(b.to), "Remplacement impossible.");
    t.teams = t.teams.map((x) => (x === b.from ? b.to : x));
    for (const m of t.matches) { if (m.a === b.from) m.a = b.to; if (m.b === b.from) m.b = b.to; }
    resolve();
    logEvent(`${teamName(T(b.to))} remplace ${teamName(T(b.from))} au tournoi`, s.label);
  }),
  "/match": edit((b, s) => {
    const t = state.tournament;
    must(t, "Pas de tournoi en cours.");
    const m = t.matches.find((x) => x.id === b.id);
    must(m, "Match introuvable.");
    must(m.a && m.b, "Les deux équipes ne sont pas encore connues.");
    if (b.clear) Object.assign(m, { sa: null, sb: null, w: null, ff: false });
    else if (b.forfeit === "a" || b.forfeit === "b") Object.assign(m, { w: b.forfeit === "a" ? "b" : "a", ff: true, sa: null, sb: null });
    else {
      const sa = Number(b.sa), sb = Number(b.sb);
      must(Number.isInteger(sa) && Number.isInteger(sb) && sa >= 0 && sb >= 0 && sa < 100 && sb < 100, "Score invalide.");
      must(t.format === "rr" || sa !== sb, "Pas d'égalité en élimination directe.");
      Object.assign(m, { sa, sb, ff: false, w: sa > sb ? "a" : sb > sa ? "b" : null });
    }
    if (b.table !== undefined) m.table = clean(b.table, 12);
    resolve();
    if (!b.clear) logEvent(m.ff ? `Forfait de ${teamName(T(m.w === "a" ? m.b : m.a))}` : `${teamName(T(m.a))} ${m.sa} – ${m.sb} ${teamName(T(m.b))}`, s.label);
  }),
  "/links": admin((b, s) => {
    const password = genPass();
    const link = { id: uid(6), token: uid(12), label: clean(b.label, 40) || "Accès", role: b.role === "view" ? ("view" as const) : ("manage" as const), passHash: hashPass(password), at: Date.now() };
    state.links.push(link);
    logEvent(`Accès « ${link.label} » créé`, s.label);
    return { url: `${PUBLIC_URL}/a/${link.token}`, password, label: link.label, role: link.role };
  }),
  "/links/revoke": admin((b, s) => {
    const l = state.links.find((x) => x.id === b.id);
    must(l, "Accès introuvable.");
    l.revoked = true;
    for (const [k, v] of Object.entries(state.sessions)) if (v.linkId === l.id) delete state.sessions[k];
    logEvent(`Accès « ${l.label} » révoqué`, s.label);
  }),
  "/password": admin((b, s) => {
    must(typeof b.password === "string" && b.password.length >= 8, "8 caractères minimum.");
    state.adminHash = hashPass(b.password);
    for (const [k, v] of Object.entries(state.sessions)) if (v.role === "admin" && k !== s.sid) delete state.sessions[k];
  }),
  "/reset": admin((b, s) => {
    must(b.confirm === "EFFACER", "Tape EFFACER pour confirmer.");
    backup();
    Object.assign(state, { players: [], teams: [], tournament: null, log: [] });
    logEvent("Inscriptions effacées", s.label);
  }),
};

for (const [path, fn] of Object.entries(writes)) {
  api.post(path, async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const out = (fn(b, c.var.sess) as object) || {};
    save();
    return c.json({ ok: true, ...out, state: view(c.var.sess) });
  });
}

api.post("/logout", (c) => { closeSession(c, c.var.sess.sid); return c.json({ ok: true }); });

