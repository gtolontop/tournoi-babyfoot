import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Link2, Trophy, UserX, UsersRound } from "lucide-react";
import { useStore } from "../lib/api";
import { ago, duration, plural } from "../lib/ui";
import { Block } from "../components/kit/Block";
import { StatCard, StatGrid } from "../components/kit/Stat";
import { ActivityFeed } from "../components/kit/Feed";
import { Button, Head } from "../components/ui";
import { Heat, Todo } from "../components/bits";
import { DAY_NAMES, fmt } from "../../shared/lunch";

const DAY = 86400000;

export function Overview() {
  const { view, act, canEdit, toast } = useStore();
  const st = view.stats;
  const t = view.tournament;

  // Inscriptions cumulées sur les dix derniers jours, pour la courbe du premier chiffre.
  const { series, labels } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const days = Array.from({ length: 10 }, (_, i) => end.getTime() - (9 - i) * DAY);
    return {
      series: days.map((d) => view.players.filter((p) => p.at <= d).length),
      labels: days.map((d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })),
    };
  }, [view.players]);

  const formUrl = view.publicUrl + "/";
  const copy = () => navigator.clipboard.writeText(formUrl).then(() => toast("Lien du formulaire copié"), () => toast(formUrl));

  const todos = [];
  if (st.solo >= 2 && canEdit) todos.push(<Todo key="solo" icon={<UsersRound size={16} />} title={`${plural(st.solo, "joueur")} sans coéquipier`} text="Associés selon leurs pauses du midi communes." action={<Button size="small" tone="primary" onClick={() => act("/teams/auto", {}, "Équipes formées")}>Former les équipes</Button>} />);
  else if (st.solo === 1) todos.push(<Todo key="solo1" icon={<UsersRound size={16} />} title="1 joueur sans coéquipier" text="Il sera associé au prochain inscrit seul." action={<Link className="ui-btn small" to="/equipes">Voir</Link>} />);
  if (st.absent) todos.push(<Todo key="abs" icon={<UserX size={16} />} title={plural(st.absent, "absent")} text="Remplace-les depuis la fiche de leur équipe." action={<Link className="ui-btn small" to="/equipes">Équipes</Link>} />);
  if (view.best) todos.push(<Todo key="best" icon={<CalendarClock size={16} />} title={`Meilleur créneau : ${DAY_NAMES[view.best.day].toLowerCase()} ${fmt(view.best.s)} – ${fmt(view.best.e)}`} text={`${plural(view.best.teams, "équipe complète", "équipes complètes")} sur ${st.teamsReady} disponibles.`} />);
  if (view.suggestion && !t) {
    const s = view.suggestion, e = s[s.pick];
    todos.push(<Todo key="fmt" icon={<Trophy size={16} />} title={s.pick === "rr" ? "Championnat conseillé" : "Élimination directe conseillée"} text={`${e.matches} matchs, environ ${duration(e.minutes)}.`} action={canEdit && <Link className="ui-btn small" to="/tournoi">Préparer</Link>} />);
  }
  if (t) todos.push(<Todo key="t" icon={<Trophy size={16} />} title={t.champion ? `Vainqueur : ${t.champion}` : `Tournoi en cours · ${t.played}/${t.total}`} action={<Link className="ui-btn small" to="/tournoi">Ouvrir</Link>} />);
  if (!todos.length) todos.push(<Todo key="share" icon={<Link2 size={16} />} title="Partage le formulaire" text="Le lien ou le QR code, les inscriptions arrivent ici." action={<Link className="ui-btn small primary" to="/partage">QR code</Link>} />);


  return (
    <div className="ui-page">
      <Head title="Aperçu" sub={st.today ? `${plural(st.today, "inscription")} ces dernières 24 h.` : view.settings.date || "Le tournoi en un coup d'œil."}>
        <Button onClick={copy}><Link2 size={15} />Lien du formulaire</Button>
        <Link className="ui-btn primary" to="/partage">QR code</Link>
      </Head>

      <StatGrid>
        <StatCard label="Joueurs inscrits" value={st.players} series={series} labels={labels} hint={st.absent ? plural(st.absent, "absent") : undefined} />
        <StatCard label="Équipes prêtes" value={st.teamsReady} hint={`${st.duo} inscrites à deux`} />
        <StatCard label="Sans coéquipier" value={st.solo} hint={st.solo ? "à associer" : "tout le monde est casé"} />
        <StatCard label="Matchs joués" value={t?.played ?? 0} hint={t ? `sur ${t.total}` : "tournoi pas lancé"} />
      </StatGrid>

      <div className="t-grid">
        <div className="t-col">
          <Block title="À faire" sub="Proposé d'après les inscriptions.">
            <div className="t-todos">{todos}</div>
          </Block>
          <Block title="Pauses du midi" sub="Joueurs à table, de 10 en 10 minutes. Le créneau marqué réunit le plus d'équipes." aside={st.noLunch ? <span className="k-badge">{st.noLunch} sans horaire</span> : null}>
            <Heat heat={view.heat} best={view.best} />
          </Block>
        </div>
        <Block title="Activité" sub="Inscriptions et changements.">
          <ActivityFeed label="Activité" empty="Les inscriptions apparaîtront ici." items={view.log.slice(0, 16).map((l, i) => ({ key: i, title: l.text, meta: l.who || undefined, at: ago(l.at), tone: "muted" }))} />
        </Block>
      </div>
    </div>
  );
}
