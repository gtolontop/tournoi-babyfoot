/** @jsxImportSource hono/jsx */
// Les pages publiques, rendues sur le serveur : le formulaire (une requête, un petit script en ligne), le tableau.
import fs from "node:fs";
import path from "node:path";
import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import { state } from "./store.ts";
import { roundName, tournamentView } from "./logic.ts";
import type { MatchView } from "../shared/types.ts";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => { try { return fs.readFileSync(path.join(root, p), "utf8"); } catch { return ""; } };
const squash = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1").trim();
// Les couleurs claires et sombres de l'espace d'organisation (tokens.css), puis les styles de la page.
let CSS = "";
let SCRIPT = "";
export function loadAssets() {
  const tokens = read("src/admin/styles/tokens.css").replace(/@media \(prefers-reduced-motion[\s\S]*$/, "");
  CSS = squash(tokens + read("src/server/form.css"));
  SCRIPT = read("dist/form.js");
}

const ICON = {
  insta: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></svg>,
  tel: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>,
  email: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
};

function Page({ title, children, script }: { title: string; children: Child; script?: boolean }) {
  return (
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#151516" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23141412'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='white' stroke-width='2.5'/%3E%3C/svg%3E" />
        <link rel="preload" href="/admin/fonts/facade.woff2" as="font" type="font/woff2" crossorigin="" />
        <style>{raw(CSS)}</style>
      </head>
      <body>
        {children}
        {script && SCRIPT && <script>{raw(SCRIPT)}</script>}
      </body>
    </html>
  );
}

function Top() {
  return (
    <header class="top">
      <b>{state.settings.name}</b>
    </header>
  );
}
const meta = () => [state.settings.date, state.settings.place].filter(Boolean).join(" · ");

export function FormPage({ ok }: { ok: boolean }) {
  const s = state.settings;
  if (!s.open) {
    return (
      <Page title={s.name}>
        <Top />
        <main>
          <h1>Inscriptions closes</h1>
          <p class="lead">Les inscriptions à ce tournoi sont terminées.</p>
          {s.publicBoard && state.tournament && <p class="lead" style="margin-top:24px"><a href="/tableau">Voir le tableau</a></p>}
        </main>
      </Page>
    );
  }
  return (
    <Page title={`Inscription · ${s.name}`} script>
      <Top />
      <main>
        <section class="done" id="done" hidden={!ok}>
          <div class="mark">{ICON.check}</div>
          <h1 id="done-title">Inscription envoyée</h1>
          <p class="lead" id="done-text">On te recontacte pour l'horaire.</p>
          <dl class="recap" id="recap" hidden />
          <div class="go">
            <a class="btn quiet" href="/" id="again">Nouvelle inscription</a>
          </div>
        </section>

        <div id="intro" hidden={ok}>
          {meta() && <p class="meta">{meta()}</p>}
          <h1>Inscription</h1>
          <p class="lead">{s.welcome || "Seul ou à deux."}</p>
        </div>
        <form id="f" method="post" action="/inscription" novalidate hidden={ok}>
          <fieldset>
            <legend>Toi</legend>
            <div class="pair">
              <input type="text" name="first" placeholder="Prénom" aria-label="Prénom" autocomplete="given-name" autocapitalize="words" maxlength={40} required enterkeyhint="next" />
              <input type="text" name="last" placeholder="Nom" aria-label="Nom" autocomplete="family-name" autocapitalize="words" maxlength={40} required enterkeyhint="next" />
            </div>
          </fieldset>

          <fieldset>
            <legend>Contact <small>optionnel</small></legend>
            <div class="seg" role="radiogroup" aria-label="Type de contact">
              <label><input type="radio" name="contactKind" value="insta" checked />{ICON.insta}<span>Instagram</span></label>
              <label><input type="radio" name="contactKind" value="tel" />{ICON.tel}<span>Téléphone</span></label>
              <label><input type="radio" name="contactKind" value="email" />{ICON.email}<span>Email</span></label>
            </div>
            <input type="text" name="contact" id="contact" placeholder="@pseudo" aria-label="Contact" autocomplete="off" autocapitalize="off" maxlength={80} />
          </fieldset>

          <fieldset>
            <legend>Équipe</legend>
            <div class="seg" role="radiogroup" aria-label="Équipe">
              <label><input type="radio" name="mode" value="solo" checked />Je viens seul</label>
              <label><input type="radio" name="mode" value="duo" id="m-duo" />Avec un coéquipier</label>
            </div>
            <div class="pair mate">
              <input type="text" name="mfirst" placeholder="Prénom du coéquipier" aria-label="Prénom du coéquipier" autocapitalize="words" maxlength={40} />
              <input type="text" name="mlast" placeholder="Nom du coéquipier" aria-label="Nom du coéquipier" autocapitalize="words" maxlength={40} />
            </div>
          </fieldset>

          <fieldset>
            <legend>Disponibilités</legend>
            <textarea name="dispo" rows={3} maxlength={200} placeholder="Ex. mardi midi, jeudi après 17h" aria-label="Disponibilités" />
            <p class="hint">Écris comme tu veux, on s'adapte.</p>
          </fieldset>

          <input class="hp" type="text" name="website" tabindex={-1} autocomplete="off" aria-hidden="true" />
          <div class="go">
            <p class="err" id="err" role="alert" />
            <button class="btn" id="go" type="submit">S'inscrire</button>
            {s.publicBoard && state.tournament && <p class="foot"><a href="/tableau">Voir le tableau du tournoi</a></p>}
          </div>
        </form>
      </main>
    </Page>
  );
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <Page title="Inscription">
      <Top />
      <main>
        <h1>Oups</h1>
        <p class="lead">{message}</p>
        <div class="go" style="margin-top:32px"><a class="btn quiet" href="/">Revenir au formulaire</a></div>
      </main>
    </Page>
  );
}

export function NotFound() {
  return (
    <Page title="Introuvable">
      <Top />
      <main>
        <h1>Page introuvable</h1>
        <p class="lead"><a href="/">Aller au formulaire</a></p>
      </main>
    </Page>
  );
}

function MatchBox({ m }: { m: MatchView }) {
  const side = (name: string | null, score: number | null, k: "a" | "b") => {
    if (!name) return <div class="tbd"><span>À venir</span><b /></div>;
    const cls = m.w ? (m.w === k ? "w" : "l") : "";
    return <div class={cls}><span>{name}</span><b>{m.ff && m.w !== k ? "forfait" : score ?? ""}</b></div>;
  };
  return <div class="m">{side(m.an, m.sa, "a")}{side(m.bn, m.sb, "b")}</div>;
}

export function BoardPage() {
  const s = state.settings;
  const t = tournamentView();
  let body: Child = <p class="lead">Le tournoi n'a pas encore commencé.</p>;
  if (t) {
    const rounds: MatchView[][] = [];
    for (const m of t.matches) (rounds[m.round] ||= []).push(m);
    body = t.format === "elim" ? (
      <>
        {t.champion && <div class="champ"><small>Vainqueur</small><b>{t.champion}</b></div>}
        <div class="rounds">
          {rounds.map((ms, r) => {
            const shown = ms.filter((m) => !m.bye && !(r === 0 && !m.a && !m.b));
            return shown.length ? <section class="round"><h2>{roundName(r, t.totalRounds)}</h2><div class="ms">{shown.map((m) => <MatchBox m={m} />)}</div></section> : null;
          })}
        </div>
      </>
    ) : (
      <>
        <table>
          <thead><tr><th>#</th><th>Équipe</th><th>J</th><th>V</th><th>D</th><th>Diff</th><th>Pts</th></tr></thead>
          <tbody>{t.standings!.map((r, i) => <tr><td>{i + 1}</td><td><b>{r.name}</b></td><td>{r.j}</td><td>{r.v}</td><td>{r.d}</td><td>{r.bp - r.bc > 0 ? "+" : ""}{r.bp - r.bc}</td><td><b>{r.pts}</b></td></tr>)}</tbody>
        </table>
        {rounds.map((ms, r) => <section style="margin-top:28px"><h2 class="label">Journée {r + 1}</h2><div class="days">{ms.map((m) => <MatchBox m={m} />)}</div></section>)}
      </>
    );
  }
  return (
    <Page title={`Tableau · ${s.name}`}>
      <Top />
      <main class="board">
        <h1>Tableau</h1>
        {t && <p class="lead">{t.played} match{t.played > 1 ? "s" : ""} joué{t.played > 1 ? "s" : ""} sur {t.total}</p>}
        {body}
      </main>
      <script>{raw("setTimeout(function(){location.reload()},20000)")}</script>
    </Page>
  );
}
