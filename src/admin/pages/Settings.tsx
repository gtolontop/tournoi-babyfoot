import { useState, type FormEvent } from "react";
import { useStore } from "../lib/api";
import { Block } from "../components/kit/Block";
import { Button, Confirm, Field, Head, Switch } from "../components/ui";

export function SettingsPage() {
  const { view, act } = useStore();
  const s = view.settings;
  const [form, setForm] = useState({ name: s.name, date: s.date, place: s.place, welcome: s.welcome, tables: String(s.tables), matchMinutes: String(s.matchMinutes) });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await act("/settings", form, "Réglages enregistrés"); } catch {}
    setBusy(false);
  };

  return (
    <div className="ui-page narrow">
      <Head title="Réglages" sub="Ce que voient les joueurs, et le déroulé des matchs." />
      <div className="t-grid">
        <Block title="Tournoi">
          <form className="t-form" onSubmit={save}>
            <Field label="Nom"><input value={form.name} onChange={set("name")} maxLength={80} /></Field>
            <div className="t-pair">
              <Field label="Date"><input value={form.date} onChange={set("date")} placeholder="Jeudi 27 novembre" maxLength={60} /></Field>
              <Field label="Lieu"><input value={form.place} onChange={set("place")} placeholder="Foyer, bâtiment B" maxLength={80} /></Field>
            </div>
            <Field label="Phrase sous le titre du formulaire" hint="Par défaut : « Seul ou à deux. »"><input value={form.welcome} onChange={set("welcome")} maxLength={160} /></Field>
            <div className="t-pair">
              <Field label="Tables de baby-foot"><input type="number" min={1} max={20} value={form.tables} onChange={set("tables")} /></Field>
              <Field label="Minutes par match"><input type="number" min={2} max={90} value={form.matchMinutes} onChange={set("matchMinutes")} /></Field>
            </div>
            <div><Button tone="primary" type="submit" busy={busy}>Enregistrer</Button></div>
          </form>
        </Block>
        <div className="t-col">
          <Block title="Ouverture">
            <Switch label="Inscriptions ouvertes" hint="Fermé, le formulaire annonce que les inscriptions sont closes." checked={s.open} onChange={(v) => act("/settings", { open: v }, v ? "Inscriptions ouvertes" : "Inscriptions fermées")} />
            <Switch label="Tableau public" hint="La page /tableau, lisible sans mot de passe." checked={s.publicBoard} onChange={(v) => act("/settings", { publicBoard: v })} />
          </Block>
          {view.me.role === "admin" && <AdminBlock />}
        </div>
      </div>
    </div>
  );
}

function AdminBlock() {
  const { act } = useStore();
  const [pw, setPw] = useState("");
  const [reset, setReset] = useState(false);
  const [word, setWord] = useState("");
  return (
    <Block title="Admin" sub="Changer le mot de passe déconnecte les autres sessions admin.">
      <form className="t-inline-form" onSubmit={(e) => { e.preventDefault(); act("/password", { password: pw }, "Mot de passe changé").then(() => setPw(""), () => {}); }}>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" />
        <Button type="submit" disabled={pw.length < 8}>Changer</Button>
      </form>
      <div className="t-sep" />
      <Button tone="danger" onClick={() => setReset(true)}>Effacer toutes les inscriptions</Button>
      {reset && (
        <Confirm title="Tout effacer" label="Effacer" onClose={() => { setReset(false); setWord(""); }} onConfirm={() => act("/reset", { confirm: word.trim().toUpperCase() }, "Inscriptions effacées")} text={
          <>Joueurs, équipes et tournoi sont supprimés ; une copie reste sur le serveur. Tape EFFACER pour confirmer.<input style={{ marginTop: 12, width: "100%" }} value={word} onChange={(e) => setWord(e.target.value)} placeholder="EFFACER" /></>
        } />
      )}
    </Block>
  );
}
