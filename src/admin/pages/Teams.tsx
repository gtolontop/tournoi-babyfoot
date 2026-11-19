import { useState } from "react";
import { Plus, Shuffle } from "lucide-react";
import type { TeamView } from "../../shared/types";
import { useStore } from "../lib/api";
import { plural } from "../lib/ui";
import { Block } from "../components/kit/Block";
import { Button, Confirm, Empty, Field, Head, Panel, Pill } from "../components/ui";
import { Avatar } from "../components/bits";

export function Teams() {
  const { view, act, canEdit, toast } = useStore();
  const [open, setOpen] = useState<TeamView | "new" | null>(null);
  const waiting = view.players.filter((p) => !p.team && !p.absent);
  const P = (id: string | null) => view.players.find((p) => p.id === id);
  const ok = (t: TeamView) => (t.complete && !t.absent ? 1 : 0);
  // Ce qui demande une action d'abord : absents, incomplètes.
  const teams = [...view.teams].sort((a, b) => ok(a) - ok(b) || b.at - a.at);
  const incomplete = view.teams.some((t) => !t.complete && !t.inTournament);

  const auto = async () => {
    const r = await act("/teams/auto", {});
    toast(r.made ? `${plural(r.made, "équipe formée", "équipes formées")}${r.left ? `, ${r.left} en attente` : ""}` : "Équipes complétées");
  };

  return (
    <div className="ui-page">
      <Head title="Équipes" sub={`${plural(view.stats.teamsReady, "équipe prête", "équipes prêtes")}${view.teams.length > view.stats.teamsReady ? `, ${view.teams.length - view.stats.teamsReady} à compléter` : ""}.`}>
        {canEdit && <Button onClick={() => setOpen("new")}><Plus size={15} />Créer</Button>}
        {canEdit && <Button tone="primary" onClick={auto} disabled={waiting.length < 2 && !incomplete}><Shuffle size={15} />Former automatiquement</Button>}
      </Head>

      {waiting.length > 0 && (
        <Block title={`Sans coéquipier · ${waiting.length}`} sub="La formation automatique associe ceux qui mangent aux mêmes heures.">
          <div className="t-waiting">
            {waiting.map((p) => (
              <span key={p.id} className="t-chip">
                <b>{p.first} {p.last}</b>
                {p.summary && <small>{p.summary}</small>}
              </span>
            ))}
          </div>
        </Block>
      )}

      {teams.length ? (
        <div className="t-teams">
          {teams.map((t) => {
            const a = P(t.a), b = P(t.b);
            const status = t.absent ? <Pill tone="tint">Absent</Pill> : !t.complete ? <Pill tone="muted">Incomplète</Pill> : t.inTournament ? <Pill tone="ink">Au tournoi</Pill> : <Pill tone="ok">Prête</Pill>;
            return (
              <div key={t.id} className={`ui-card ${canEdit ? "clickable" : ""} t-team`} onClick={canEdit ? () => setOpen(t) : undefined} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} onKeyDown={(e) => canEdit && e.key === "Enter" && setOpen(t)}>
                <div className="ui-card-head"><strong className="ellipsis">{t.label}</strong>{status}</div>
                {[a, b].map((p, i) => p ? (
                  <div key={i} className={`t-member ${p.absent ? "off" : ""}`}><Avatar name={`${p.first} ${p.last}`} off={p.absent} /><span className="ellipsis">{p.first} {p.last}</span>{p.absent && <small>absent</small>}</div>
                ) : (
                  <div key={i} className="t-member empty"><Avatar name="?" /><span>Place libre</span></div>
                ))}
                <small className="t-team-foot">{t.complete ? (t.summary ? `Ensemble : ${t.summary}` : "Aucune pause en commun") : "En attente d'un joueur"}</small>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="Aucune équipe">Les inscriptions à deux créent leur équipe. Les joueurs seuls s'associent avec « Former automatiquement ».</Empty>
      )}
      {open && <TeamPanel team={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TeamPanel({ team: t, onClose }: { team: TeamView | null; onClose: () => void }) {
  const { view, act } = useStore();
  const [name, setName] = useState(t?.name ?? "");
  const [a, setA] = useState(t?.a ?? "");
  const [b, setB] = useState(t?.b ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Remplaçants proposés d'abord : les joueurs sans équipe. Les autres seraient déplacés.
  const options = (current: string, other: string) => {
    const free = view.players.filter((p) => !p.absent && p.id !== other && (!p.team || p.id === current || p.team === t?.id));
    const taken = view.players.filter((p) => p.team && p.team !== t?.id && p.id !== other);
    const cur = view.players.find((p) => p.id === current);
    return (
      <>
        <option value="">Place libre</option>
        {cur?.absent && <option value={cur.id}>{cur.first} {cur.last} (absent)</option>}
        {free.length > 0 && <optgroup label="Disponibles">{free.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}{p.summary ? ` · ${p.summary}` : ""}</option>)}</optgroup>}
        {taken.length > 0 && <optgroup label="Dans une autre équipe">{taken.map((p) => <option key={p.id} value={p.id}>{p.first} {p.last}{p.absent ? " (absent)" : ""} · avec {p.mate}</option>)}</optgroup>}
      </>
    );
  };
  const save = async () => {
    setBusy(true);
    try { await act("/team", { id: t?.id, name, a, b }, t ? "Équipe enregistrée" : "Équipe créée"); onClose(); }
    catch { /* affiché */ }
    finally { setBusy(false); }
  };
  if (confirm && t) return <Confirm title="Dissoudre l'équipe" text="Les deux joueurs repassent sans coéquipier." label="Dissoudre" onConfirm={() => act("/team/delete", { id: t.id }, "Équipe dissoute")} onClose={onClose} />;

  return (
    <Panel title={t ? t.label : "Nouvelle équipe"} onClose={onClose} foot={<>
      <Button tone="primary" busy={busy} onClick={save}>Enregistrer</Button>
      <Button tone="quiet" onClick={onClose}>Annuler</Button>
      <span className="t-grow" />
      {t && !t.inTournament && <Button tone="danger" onClick={() => setConfirm(true)}>Dissoudre</Button>}
    </>}>
      <div className="t-panel-pad t-form">
        {t?.absent && <p className="t-note">Un joueur est absent : choisis un remplaçant. Les joueurs sans équipe sont proposés en premier.</p>}
        <Field label="Nom d'équipe" hint="Optionnel, sinon les prénoms."><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t?.label ?? "Les Gamelles"} maxLength={40} /></Field>
        <Field label="Joueur 1"><select value={a} onChange={(e) => setA(e.target.value)}>{options(a, b)}</select></Field>
        <Field label="Joueur 2"><select value={b} onChange={(e) => setB(e.target.value)}>{options(b, a)}</select></Field>
        {t?.inTournament && <p className="muted small">Cette équipe joue le tournoi : ses résultats restent acquis au remplaçant.</p>}
      </div>
    </Panel>
  );
}
