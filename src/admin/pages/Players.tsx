import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import type { ContactKind, PlayerView } from "../../shared/types";
import { parseDispo, summary } from "../../shared/dispo";
import { useStore } from "../lib/api";
import { ago, fold } from "../lib/ui";
import { Block } from "../components/kit/Block";
import { DataTable } from "../components/kit/Table";
import { Segmented, Tabs } from "../components/kit/Tabs";
import { Button, Confirm, Field, Head, Panel, Pill } from "../components/ui";
import { CONTACT, ContactLink } from "../components/bits";

type Filter = "all" | "solo" | "team" | "absent";

export function Players() {
  const { view, canEdit } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PlayerView | "new" | null>(null);

  const counts = {
    all: view.players.length,
    solo: view.players.filter((p) => !p.team && !p.absent).length,
    team: view.players.filter((p) => p.team).length,
    absent: view.players.filter((p) => p.absent).length,
  };
  const rows = useMemo(() => {
    const k = fold(q.trim());
    return view.players
      .filter((p) => filter === "all" || (filter === "solo" ? !p.team && !p.absent : filter === "team" ? !!p.team : p.absent))
      .filter((p) => !k || fold(`${p.first} ${p.last} ${p.mate ?? ""} ${p.contact?.value ?? ""} ${p.dispo}`).includes(k))
      .sort((a, b) => b.at - a.at);
  }, [view.players, filter, q]);

  return (
    <div className="ui-page">
      <Head title="Joueurs" sub={`${view.stats.players} inscrits, ${view.stats.present} présents.`}>
        <a className="ui-btn" href="/api/export.csv"><Download size={15} />Export</a>
        {canEdit && <Button tone="primary" onClick={() => setOpen("new")}><Plus size={15} />Ajouter</Button>}
      </Head>

      <Block flush>
        <div className="t-table-tools">
          <Tabs label="Filtrer" active={filter} onChange={setFilter} items={[
            { id: "all", label: "Tous", count: counts.all },
            { id: "solo", label: "Seuls", count: counts.solo },
            { id: "team", label: "En équipe", count: counts.team },
            { id: "absent", label: "Absents", count: counts.absent },
          ]} />
          <label className="t-search">
            <Search size={14} />
            <input type="search" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <DataTable<PlayerView>
          label="Joueurs"
          rows={rows}
          rowKey={(p) => p.id}
          onRow={canEdit ? (p) => setOpen(p) : undefined}
          empty={view.players.length ? "Aucun joueur ne correspond." : "Personne n'est encore inscrit. Partage le QR code."}
          columns={[
            { key: "name", label: "Joueur", cell: (p) => (
              <span className="t-name">
                <b className={p.absent ? "t-strike" : ""}>{p.first} {p.last}</b>
                <small>{p.by === "partner" ? (p.confirmed ? "inscrit par son coéquipier, confirmé" : "inscrit par son coéquipier") : p.by === "staff" ? "ajouté par l'organisation" : ago(p.at)}</small>
              </span>
            ) },
            { key: "team", label: "Équipe", cell: (p) => p.absent ? <Pill tone="tint">Absent</Pill> : p.team ? <Pill tone="ok">avec {p.mate?.split(" ")[0]}</Pill> : <Pill tone="muted">Seul</Pill> },
            { key: "dispo", label: "Disponibilités", phone: false, cell: (p) => p.dispo ? (
              <span className="t-dispo"><span className="ellipsis" title={p.dispo}>{p.dispo}</span>{p.summary && <small>{p.summary}</small>}</span>
            ) : <span className="muted">—</span> },
            { key: "contact", label: "Contact", phone: false, cell: (p) => <ContactLink c={p.contact} /> },
          ]}
        />
      </Block>
      {open && <PlayerPanel player={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PlayerPanel({ player: p, onClose }: { player: PlayerView | null; onClose: () => void }) {
  const { act } = useStore();
  const [first, setFirst] = useState(p?.first ?? "");
  const [last, setLast] = useState(p?.last ?? "");
  const [kind, setKind] = useState<ContactKind>(p?.contact?.kind ?? "insta");
  const [contact, setContact] = useState(p?.contact?.value ?? "");
  const [dispo, setDispo] = useState(p?.dispo ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const read = summary(parseDispo(dispo));

  const save = async () => {
    setBusy(true);
    try { await act("/player", { id: p?.id, first, last, contactKind: kind, contact, dispo }, p ? "Fiche enregistrée" : "Joueur ajouté"); onClose(); }
    catch { /* le message est déjà affiché */ }
    finally { setBusy(false); }
  };
  if (confirm && p) return <Confirm title={`Supprimer ${p.first} ${p.last}`} text="Il sera retiré de son équipe. C'est définitif." label="Supprimer" onConfirm={() => act("/player/delete", { id: p.id }, "Joueur supprimé")} onClose={onClose} />;

  return (
    <Panel title={p ? `${p.first} ${p.last}` : "Nouveau joueur"} onClose={onClose} foot={<>
      <Button tone="primary" busy={busy} onClick={save} disabled={!first.trim() || !last.trim()}>{p ? "Enregistrer" : "Ajouter"}</Button>
      {p && <Button onClick={() => act("/player/absent", { id: p.id, absent: !p.absent }, p.absent ? "Présent" : "Marqué absent").then(onClose)}>{p.absent ? "Marquer présent" : "Marquer absent"}</Button>}
      <span className="t-grow" />
      {p && <Button tone="danger" onClick={() => setConfirm(true)}>Supprimer</Button>}
    </>}>
      <div className="t-panel-pad t-form">
        <div className="t-pair">
          <Field label="Prénom"><input value={first} onChange={(e) => setFirst(e.target.value)} autoFocus={!p} /></Field>
          <Field label="Nom"><input value={last} onChange={(e) => setLast(e.target.value)} /></Field>
        </div>
        <div className="t-field">
          <span>Contact</span>
          <Segmented label="Type de contact" active={kind} onChange={setKind} items={(Object.keys(CONTACT) as ContactKind[]).map((k) => ({ id: k, label: CONTACT[k].label }))} />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={kind === "insta" ? "pseudo" : kind === "tel" ? "06 12 34 56 78" : "prenom@exemple.fr"} />
        </div>
        <Field label="Disponibilités" hint={read ? `Compris : ${read}` : "Texte libre, comme dans le formulaire."}>
          <textarea rows={3} value={dispo} onChange={(e) => setDispo(e.target.value)} placeholder="Ex. mardi midi, jeudi après 17h" />
        </Field>
        {p?.mate && <p className="muted small">En équipe avec {p.mate}. Les équipes se modifient dans Équipes.</p>}
      </div>
    </Panel>
  );
}
