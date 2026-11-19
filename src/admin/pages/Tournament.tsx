import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ExternalLink, Minus, Plus, Trophy } from "lucide-react";
import type { Format, MatchView } from "../../shared/types";
import { useStore } from "../lib/api";
import { cx, duration, plural } from "../lib/ui";
import { Block } from "../components/kit/Block";
import { Segmented } from "../components/kit/Tabs";
import { Button, Confirm, Empty, Field, Head, Panel, Switch } from "../components/ui";

export function Tournament() {
  const { view } = useStore();
  return view.tournament ? <Running /> : <Setup />;
}

function estimate(format: Format, n: number, tables: number, mm: number) {
  if (n < 2) return null;
  if (format === "elim") {
    let size = 1; while (size < n) size *= 2;
    let minutes = Math.ceil((n - size / 2) / tables) * mm, rem = size / 2;
    while (rem > 1) { rem /= 2; minutes += Math.ceil(rem / tables) * mm; }
    return { matches: n - 1, minutes };
  }
  const rounds = n % 2 ? n : n - 1;
  return { matches: (n * (n - 1)) / 2, minutes: rounds * Math.ceil(Math.floor(n / 2) / tables) * mm };
}

function Setup() {
  const { view, act, canEdit } = useStore();
  const ready = view.teams.filter((t) => t.complete && !t.absent);
  const [picks, setPicks] = useState<Set<string>>(() => new Set(ready.map((t) => t.id)));
  const [format, setFormat] = useState<Format>(view.suggestion?.pick ?? "elim");
  const [shuffle, setShuffle] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = [...picks].filter((id) => ready.some((t) => t.id === id)).length;
  const { tables, matchMinutes } = view.settings;
  const e = estimate(format, n, tables, matchMinutes);
  const toggle = (id: string) => setPicks((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  if (ready.length < 2) {
    return (
      <div className="ui-page">
        <Head title="Tournoi" sub="Le tableau se génère à partir des équipes prêtes." />
        <Empty title={`${plural(ready.length, "équipe prête", "équipes prêtes")}`} action={<Link className="ui-btn" to="/equipes">Aller aux équipes</Link>}>Il en faut au moins deux pour lancer le tournoi.</Empty>
      </div>
    );
  }

  return (
    <div className="ui-page">
      <Head title="Tournoi" sub="Choisis le format et les équipes engagées." />
      <div className="t-grid">
        <Block title="Format" sub={view.suggestion?.why}>
          <Segmented label="Format" active={format} onChange={setFormat} items={[{ id: "elim", label: "Élimination directe" }, { id: "rr", label: "Championnat" }]} />
          <p className="muted small">{format === "elim" ? "Le perdant sort. Des exempts complètent le premier tour si besoin." : "Toutes les équipes se rencontrent, classement aux points (3 la victoire, 1 le nul)."}</p>
          <dl className="t-facts">
            <div><dt>Matchs</dt><dd className="k-num">{e?.matches ?? "—"}</dd></div>
            <div><dt>Durée estimée</dt><dd className="k-num">{e ? duration(e.minutes) : "—"}</dd></div>
            <div><dt>Tables</dt><dd className="k-num">{tables} · {matchMinutes} min par match</dd></div>
          </dl>
          <Switch label="Tirage au sort" hint="Sinon les équipes sont placées dans l'ordre de la liste." checked={shuffle} onChange={setShuffle} />
          <Button tone="primary" busy={busy} disabled={n < 2 || !canEdit} onClick={async () => { setBusy(true); try { await act("/tournament", { format, teams: [...picks].filter((id) => ready.some((t) => t.id === id)), shuffle }, "Tableau généré"); } catch {} setBusy(false); }}>
            <Trophy size={15} />Lancer avec {n} équipes
          </Button>
        </Block>
        <Block title={`Équipes engagées · ${n}/${ready.length}`} sub={view.best ? `Créneau qui en réunit le plus : ${view.best.label.toLowerCase()}.` : undefined} flush>
          <div className="t-picks">
            {ready.map((t) => (
              <label key={t.id} className="t-pick">
                <input type="checkbox" checked={picks.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="ellipsis">{t.label}</span>
                <small className="ellipsis">{t.summary}</small>
              </label>
            ))}
          </div>
        </Block>
      </div>
    </div>
  );
}

const roundName = (r: number, total: number) => {
  const left = total - r;
  return left === 1 ? "Finale" : left === 2 ? "Demi-finales" : left === 3 ? "Quarts" : left === 4 ? "Huitièmes" : `Tour ${r + 1}`;
};

function Running() {
  const { view, act, canEdit } = useStore();
  const t = view.tournament!;
  const [score, setScore] = useState<MatchView | null>(null);
  const [swap, setSwap] = useState(false);
  const [reset, setReset] = useState(false);
  const rounds: MatchView[][] = [];
  for (const m of t.matches) (rounds[m.round] ||= []).push(m);
  const pct = t.total ? Math.round((t.played / t.total) * 100) : 0;

  return (
    <div className="ui-page">
      <Head title="Tournoi" sub={`${t.format === "rr" ? "Championnat" : "Élimination directe"}, ${t.teams.length} équipes, ${t.played} matchs joués sur ${t.total}.`}>
        {view.settings.publicBoard && <a className="ui-btn" href="/tableau" target="_blank" rel="noreferrer"><ExternalLink size={15} />Tableau public</a>}
        {canEdit && <Button onClick={() => setSwap(true)}><ArrowLeftRight size={15} />Remplacer une équipe</Button>}
        {canEdit && <Button tone="danger" onClick={() => setReset(true)}>Réinitialiser</Button>}
      </Head>
      <div className="t-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      {t.champion && <div className="t-champ"><Trophy size={22} /><span><small>Vainqueur</small><b>{t.champion}</b></span></div>}

      {t.format === "elim" ? (
        <Block flush>
          <div className="t-bracket">
            {rounds.map((ms, r) => {
              const shown = ms.filter((m) => !m.bye && !(r === 0 && !m.a && !m.b));
              const byes = ms.filter((m) => m.bye).length;
              if (!shown.length) return null;
              return (
                <section key={r} className="t-round">
                  <header><span>{roundName(r, t.totalRounds)}</span><span className="k-num">{shown.filter((m) => m.w).length}/{shown.length}</span></header>
                  <div className="t-round-ms">
                    {shown.map((m) => <MatchCard key={m.id} m={m} onOpen={canEdit ? setScore : undefined} />)}
                    {r === 0 && byes > 0 && <p className="muted small t-center">{plural(byes, "équipe qualifiée", "équipes qualifiées")} d'office</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </Block>
      ) : (
        <div className="t-grid">
          <Block title="Classement" flush>
            <div className="k-table-wrap">
              <table className="k-table">
                <thead><tr><th>#</th><th>Équipe</th>{["J", "V", "N", "D", "Diff", "Pts"].map((x) => <th key={x} className="right">{x}</th>)}</tr></thead>
                <tbody>
                  {t.standings!.map((s, i) => (
                    <tr key={s.id}><td className="muted k-num">{i + 1}</td><td><b>{s.name}</b></td>{[s.j, s.v, s.n, s.d, (s.bp - s.bc > 0 ? "+" : "") + (s.bp - s.bc)].map((x, k) => <td key={k} className="right k-num">{x}</td>)}<td className="right k-num"><b>{s.pts}</b></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
          <div className="t-col">
            {rounds.map((ms, r) => (
              <Block key={r} title={`Journée ${r + 1}`} aside={<span className="k-badge">{ms.filter((m) => m.w || m.sa != null).length}/{ms.length}</span>}>
                <div className="t-round-ms">{ms.map((m) => <MatchCard key={m.id} m={m} onOpen={canEdit ? setScore : undefined} />)}</div>
              </Block>
            ))}
          </div>
        </div>
      )}
      {score && <ScorePanel m={score} rr={t.format === "rr"} onClose={() => setScore(null)} />}
      {swap && <SwapPanel onClose={() => setSwap(false)} />}
      {reset && <Confirm title="Réinitialiser le tournoi" text="Le tableau et les scores sont effacés. Les joueurs et les équipes restent." label="Réinitialiser" onConfirm={() => act("/tournament/delete", {}, "Tournoi réinitialisé")} onClose={() => setReset(false)} />}
    </div>
  );
}

function MatchCard({ m, onOpen }: { m: MatchView; onOpen?: (m: MatchView) => void }) {
  const playable = !!(m.a && m.b && !m.bye);
  const live = playable && !m.w && m.sa == null;
  const side = (name: string | null, score: number | null, k: "a" | "b") => {
    if (!name) return <span className="t-side tbd"><span>En attente</span></span>;
    return (
      <span className={cx("t-side", m.w && (m.w === k ? "win" : "lose"))}>
        <span className="ellipsis">{name}</span>
        {m.ff && m.w !== k ? <em>forfait</em> : <b className="k-num">{score ?? ""}</b>}
      </span>
    );
  };
  return (
    <button type="button" className={cx("t-match", live && "live")} disabled={!playable || !onOpen} onClick={() => onOpen?.(m)}>
      {side(m.an, m.sa, "a")}
      {side(m.bn, m.sb, "b")}
      {m.table && <span className="t-match-meta">Table {m.table}</span>}
    </button>
  );
}

function ScorePanel({ m, rr, onClose }: { m: MatchView; rr: boolean; onClose: () => void }) {
  const { act, toast } = useStore();
  const [sa, setSa] = useState(m.sa ?? 0);
  const [sb, setSb] = useState(m.sb ?? 0);
  const [table, setTable] = useState(m.table ?? "");
  const send = async (body: object, msg: string) => { try { await act("/match", { id: m.id, table, ...body }, msg); onClose(); } catch {} };
  const step = (v: number, set: (n: number) => void, d: number) => set(Math.max(0, Math.min(99, v + d)));
  const Side = ({ name, v, set }: { name: string; v: number; set: (n: number) => void }) => (
    <div className="t-score-side">
      <b className="ellipsis">{name}</b>
      <div className="t-stepper">
        <button type="button" onClick={() => step(v, set, -1)} aria-label="Moins"><Minus size={16} /></button>
        <input inputMode="numeric" value={v} onChange={(e) => set(Math.max(0, Math.min(99, Number(e.target.value.replace(/\D/g, "")) || 0)))} aria-label={`Score ${name}`} />
        <button type="button" onClick={() => step(v, set, 1)} aria-label="Plus"><Plus size={16} /></button>
      </div>
    </div>
  );
  return (
    <Panel title="Score" onClose={onClose} foot={<>
      <Button tone="primary" onClick={() => (!rr && sa === sb ? toast("Pas d'égalité en élimination directe", true) : send({ sa, sb }, "Score enregistré"))}>Valider</Button>
      <Button tone="quiet" onClick={onClose}>Annuler</Button>
      <span className="t-grow" />
      {(m.w || m.sa != null) && <Button tone="danger" onClick={() => send({ clear: true }, "Score effacé")}>Effacer</Button>}
    </>}>
      <div className="t-panel-pad t-form">
        <div className="t-score">
          <Side name={m.an!} v={sa} set={setSa} />
          <span className="t-score-vs">–</span>
          <Side name={m.bn!} v={sb} set={setSb} />
        </div>
        <Field label="Table"><input value={table} onChange={(e) => setTable(e.target.value)} placeholder="1" maxLength={12} /></Field>
        <div className="t-field">
          <span>Forfait</span>
          <div className="t-pair">
            <Button onClick={() => send({ forfeit: "a" }, `Forfait de ${m.an}`)}>{m.an}</Button>
            <Button onClick={() => send({ forfeit: "b" }, `Forfait de ${m.bn}`)}>{m.bn}</Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SwapPanel({ onClose }: { onClose: () => void }) {
  const { view, act } = useStore();
  const t = view.tournament!;
  const inside = view.teams.filter((x) => t.teams.includes(x.id));
  const outside = view.teams.filter((x) => !t.teams.includes(x.id) && x.complete && !x.absent);
  const [from, setFrom] = useState(inside.find((x) => x.absent)?.id ?? inside[0]?.id ?? "");
  const [to, setTo] = useState(outside[0]?.id ?? "");
  return (
    <Panel title="Remplacer une équipe" onClose={onClose} foot={<>
      <Button tone="primary" disabled={!from || !to} onClick={() => act("/tournament/swap", { from, to }, "Équipe remplacée").then(onClose, () => {})}>Remplacer</Button>
      <Button tone="quiet" onClick={onClose}>Annuler</Button>
    </>}>
      <div className="t-panel-pad t-form">
        {outside.length ? (
          <>
            <p className="muted">L'équipe qui entre reprend la place et les résultats déjà acquis.</p>
            <Field label="Équipe qui sort"><select value={from} onChange={(e) => setFrom(e.target.value)}>{inside.map((x) => <option key={x.id} value={x.id}>{x.label}{x.absent ? " (absent)" : ""}</option>)}</select></Field>
            <Field label="Équipe qui entre"><select value={to} onChange={(e) => setTo(e.target.value)}>{outside.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          </>
        ) : (
          <p className="muted">Aucune équipe de réserve. Crée-en une dans Équipes, ou remplace directement le joueur absent dans la fiche de son équipe.</p>
        )}
      </div>
    </Panel>
  );
}
