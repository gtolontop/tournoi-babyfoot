/** @jsxImportSource hono/jsx */
// Les pages publiques, rendues sur le serveur : le formulaire (une requête, un petit script en ligne), le tableau.
import fs from "node:fs";
import path from "node:path";
import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import { state } from "./store.ts";
import { roundName, tournamentView } from "./logic.ts";
import type { MatchView } from "../shared/types.ts";
import { DAY_NAMES, fmt, services } from "../shared/lunch.ts";

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

// Les petits dessins : tracés fins en currentColor, ils suivent donc le thème (noir en clair, blanc en sombre).
// pathLength="1" permet de les « dessiner » en CSS (stroke-dashoffset de 1 à 0).
const ICON = {
  check: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8" pathLength="1" /></svg>,
  spin: <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>,
  solo: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="3.4" /></svg>,
  duo: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="6.2" cy="7" r="3.4" /><circle cx="11.8" cy="7" r="3.4" /></svg>,
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

const meta = () => [state.settings.name, state.settings.date, state.settings.place].filter(Boolean).join(" · ");

// Une ligne par jour : « Mar  12h – 13h ». Vide = ne mange pas au lycée ce jour-là.
function LunchRows({ p }: { p: "l" | "m" }) {
  const s = state.settings;
  const sv = services(s.lunchFrom, s.lunchTo);
  return (
    <div class="lunch" data-lunch={p}>
      {s.days.map((d) => (
        <div class="day" data-day={d}>
          <span>{DAY_NAMES[d]}</span>
          <div class="sv">
            {sv.map(([a, b]) => (
              <label><input type="checkbox" name={`${p}${d}`} value={a} aria-label={`${DAY_NAMES[d]} ${fmt(a)} à ${fmt(b)}`} />{fmt(a)} – {fmt(b)}</label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormPage({ ok }: { ok: boolean }) {
  const s = state.settings;
  if (!s.open) {
    return (
      <Page title={s.name}>
        <main>
          <p class="meta">{meta()}</p>
          <h1>Inscriptions closes</h1>
          {s.publicBoard && state.tournament && <p class="lead"><a href="/tableau">Voir le tableau</a></p>}
        </main>
      </Page>
    );
  }
  return (
    <Page title={`Inscription · ${s.name}`} script>
      <main>
        <section class="done" id="done" hidden={!ok}>
          <div class="mark">{ICON.check}</div>
          <h1 id="done-title">Inscription envoyée</h1>
          <p class="lead" id="done-text">On te dit quand tu joues.</p>
          <dl class="recap" id="recap" hidden />
          <div class="go">
            <a class="btn quiet" href="/" id="again">Nouvelle inscription</a>
          </div>
        </section>

        <form id="f" method="post" action="/inscription" novalidate hidden={ok}>
          <header>
            <p class="meta">{meta()}</p>
            <h1>Inscription</h1>
            {s.welcome && <p class="lead">{s.welcome}</p>}
          </header>

          <fieldset>
            <div class="pair">
              <input type="text" name="first" placeholder="Prénom" aria-label="Prénom" autocomplete="given-name" autocapitalize="words" maxlength={40} required enterkeyhint="next" />
              <input type="text" name="last" placeholder="Nom" aria-label="Nom" autocomplete="family-name" autocapitalize="words" maxlength={40} required enterkeyhint="next" />
            </div>
            <input type="text" name="contact" placeholder="Insta, téléphone ou email" aria-label="Contact" autocomplete="off" autocapitalize="off" spellcheck={false} maxlength={80} enterkeyhint="next" />
            <p class="hint">Facultatif. Pour te rappeler tes matchs et te prévenir s'il y a un changement.</p>
          </fieldset>

          <fieldset>
            <legend>Tu manges à quel service ? <button type="button" class="copy" data-copy="l" hidden>Pareil tous les jours</button></legend>
            <LunchRows p="l" />
            <p class="hint">Facultatif. Coche tes heures de pause du midi : on te convoque pour jouer pendant. Rien de coché = pas dispo ce jour-là.</p>
          </fieldset>

          <fieldset>
            <legend>Équipe</legend>
            <div class="seg" role="radiogroup" aria-label="Équipe">
              <label><input type="radio" name="mode" value="solo" checked />{ICON.solo}Seul</label>
              <label><input type="radio" name="mode" value="duo" id="m-duo" />{ICON.duo}À deux</label>
            </div>
            <p class="hint solo-hint">On te met en équipe avec un autre joueur inscrit seul.</p>
            <p class="hint duo-hint">Vous jouez ensemble. Coche aussi ses services.</p>
            {/* Deux boîtes : la grille extérieure s'ouvre en hauteur (0fr → 1fr), l'intérieure coupe ce qui dépasse. */}
            <div class="mate">
              <div class="mate-in">
              <div class="pair">
                <input type="text" name="mfirst" placeholder="Prénom du coéquipier" aria-label="Prénom du coéquipier" autocapitalize="words" maxlength={40} />
                <input type="text" name="mlast" placeholder="Nom" aria-label="Nom du coéquipier" autocapitalize="words" maxlength={40} />
              </div>
              <p class="sub"><span>Et lui ?</span><button type="button" class="copy" data-copy="m" hidden>Pareil tous les jours</button><button type="button" class="copy" data-same>Comme moi</button></p>
              <LunchRows p="m" />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <input type="text" name="note" class="note" placeholder="Autre chose ?" aria-label="Autre chose" maxlength={300} enterkeyhint="send" />
          </fieldset>

          <input class="hp" type="text" name="website" tabindex={-1} autocomplete="off" aria-hidden="true" />
          <div class="go">
            <button class="btn" id="go" type="submit">{ICON.spin}<span class="lbl">S'inscrire</span></button>
            {s.publicBoard && state.tournament && <p class="foot"><a href="/tableau">Voir le tableau</a></p>}
          </div>
        </form>
        <p class="toast" id="err" role="alert" />
      </main>
    </Page>
  );
}

export function ErrorPage({ message }: { message: string }) {
  return (
    <Page title="Inscription">
      <main>
        <p class="meta">{state.settings.name}</p>
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
      <main class="board">
        <p class="meta">{s.name}</p>
        <h1>Tableau</h1>
        {t && <p class="lead">{t.played} match{t.played > 1 ? "s" : ""} joué{t.played > 1 ? "s" : ""} sur {t.total}</p>}
        {body}
      </main>
      <script>{raw("setTimeout(function(){location.reload()},20000)")}</script>
    </Page>
  );
}
