// Le serveur : le formulaire et le tableau publics, l'espace d'organisation (/admin), son API (/api).
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { flush, load, pending, state } from "./store.ts";
import { genPass, hashPass, ipOf, limited } from "./auth.ts";
import { PUBLIC_URL, register, UserError } from "./logic.ts";
import { api } from "./api.ts";
import { BoardPage, ErrorPage, FormPage, loadAssets, NotFound } from "./pages.tsx";

const PORT = Number(process.env.PORT) || 8110;
const HOST = process.env.HOST || "127.0.0.1";
const root = path.resolve(import.meta.dirname, "../..");
const ADMIN_DIR = path.join(root, "dist/admin");

load();
loadAssets();
if (!state.adminHash) {
  const pass = process.env.ADMIN_PASSWORD || genPass();
  state.adminHash = hashPass(pass);
  flush();
  console.log(`\n  Mot de passe admin : ${pass}\n`);
}

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
});

app.get("/health", (c) => c.json({ ok: true }));
app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));
app.get("/", (c) => { c.header("Cache-Control", "no-cache"); return c.html(FormPage({ ok: c.req.query("ok") === "1" })); });
app.get("/tableau", (c) => {
  if (!state.settings.publicBoard) return c.html(NotFound(), 404);
  c.header("Cache-Control", "no-cache");
  return c.html(BoardPage());
});

const tooMany = (c: any) => limited("reg:" + ipOf(c), 30, 10 * 60_000);
app.post("/api/register", async (c) => {
  if (tooMany(c)) return c.json({ error: "Trop d'essais, réessaie dans quelques minutes." }, 429);
  try { return c.json(register(await c.req.json())); }
  catch (e) { if (e instanceof UserError) return c.json({ error: e.message }, 400); throw e; }
});
// Sans script : le navigateur envoie le formulaire, on revient sur la page avec la confirmation.
app.post("/inscription", async (c) => {
  if (tooMany(c)) return c.html(ErrorPage({ message: "Trop d'essais, réessaie dans quelques minutes." }), 429);
  try { register((await c.req.parseBody({ all: true })) as Record<string, unknown>); return c.redirect("/?ok=1", 303); }
  catch (e) { if (e instanceof UserError) return c.html(ErrorPage({ message: e.message }), 400); throw e; }
});

app.route("/api", api);

// Un lien d'accès partagé ouvre l'écran de connexion de l'espace d'organisation.
app.get("/a/:token", (c) => c.redirect(`/admin/acces/${encodeURIComponent(c.req.param("token"))}`, 302));

// L'espace d'organisation : les fichiers construits par Vite, et index.html pour chaque écran.
app.use("/admin/assets/*", async (c, next) => { await next(); c.header("Cache-Control", "public, max-age=31536000, immutable"); });
app.use("/admin/fonts/*", async (c, next) => { await next(); c.header("Cache-Control", "public, max-age=31536000, immutable"); });
app.use("/admin/*", serveStatic({ root: path.relative(process.cwd(), path.join(root, "dist")) || ".", rewriteRequestPath: (p) => p }));
app.get("/admin", (c) => c.redirect("/admin/", 301));
app.get("/admin/*", (c) => {
  const index = path.join(ADMIN_DIR, "index.html");
  if (!fs.existsSync(index)) return c.text("Espace d'organisation non construit : npm run build", 503);
  c.header("Cache-Control", "no-store");
  return c.html(fs.readFileSync(index, "utf8"));
});

app.notFound((c) => c.html(NotFound(), 404));
app.onError((e, c) => { console.error(e); return c.text("Erreur serveur", 500); });

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => console.log(`Tournoi sur http://${HOST}:${PORT} (public : ${PUBLIC_URL})`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { if (pending()) flush(); process.exit(0); });
