import { useState, type FormEvent } from "react";
import { Copy, Download, ExternalLink, Plus, Printer, Share2 } from "lucide-react";
import { useStore } from "../lib/api";
import { ago } from "../lib/ui";
import { Block } from "../components/kit/Block";
import { DataTable } from "../components/kit/Table";
import { Segmented } from "../components/kit/Tabs";
import { Button, Confirm, Head, Pill } from "../components/ui";

type Secret = { url: string; password: string; label: string; role: string };

export function Share() {
  const { view, toast } = useStore();
  const formUrl = view.publicUrl + "/";
  const boardUrl = view.publicUrl + "/tableau";
  const qr = (text: string) => `/api/qr?text=${encodeURIComponent(text)}`;
  const copy = (text: string, msg = "Copié") => navigator.clipboard.writeText(text).then(() => toast(msg), () => toast(text));
  const s = view.settings;

  return (
    <div className="ui-page">
      <Head title="Partage" sub="Le formulaire, son QR code et les accès à l'organisation." />
      <div className="t-grid">
        <Block title="Formulaire d'inscription" sub="À afficher ou à envoyer : il ouvre directement l'inscription." aside={<Pill tone={s.open ? "ok" : "tint"}>{s.open ? "Ouvert" : "Fermé"}</Pill>}>
          <div className="t-qr">
            <img src={qr(formUrl)} alt="QR code du formulaire" />
            <div className="t-qr-side">
              <div className="t-url"><span className="ellipsis">{formUrl}</span><Button size="small" onClick={() => copy(formUrl, "Lien copié")}><Copy size={14} />Copier</Button></div>
              <div className="row gap">
                <a className="ui-btn" href={qr(formUrl) + "&format=png"}><Download size={15} />Image</a>
                <Button onClick={() => window.print()}><Printer size={15} />Affiche</Button>
                {"share" in navigator && <Button onClick={() => navigator.share({ title: s.name, url: formUrl }).catch(() => {})}><Share2 size={15} />Envoyer</Button>}
              </div>
              <a className="link small" href="/" target="_blank" rel="noreferrer"><ExternalLink size={13} />Ouvrir le formulaire</a>
            </div>
          </div>
        </Block>
        {s.publicBoard && (
          <Block title="Tableau public" sub="Les joueurs suivent les matchs en direct, sans mot de passe.">
            <div className="t-qr small">
              <img src={qr(boardUrl)} alt="QR code du tableau" loading="lazy" />
              <div className="t-qr-side">
                <div className="t-url"><span className="ellipsis">{boardUrl}</span><Button size="small" onClick={() => copy(boardUrl, "Lien copié")}><Copy size={14} />Copier</Button></div>
                <a className="link small" href="/tableau" target="_blank" rel="noreferrer"><ExternalLink size={13} />Ouvrir le tableau</a>
              </div>
            </div>
          </Block>
        )}
      </div>
      {view.me.role === "admin" && <Access />}
      <div className="t-poster" aria-hidden>
        <h1>{s.name}</h1>
        {(s.date || s.place) && <p>{[s.date, s.place].filter(Boolean).join(" · ")}</p>}
        <img src={qr(formUrl)} alt="" />
        <p>Scanne pour t'inscrire, seul ou à deux</p>
        <span>{formUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
      </div>
    </div>
  );
}

function Access() {
  const { view, act, toast } = useStore();
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<"manage" | "view">("manage");
  const [secret, setSecret] = useState<Secret | null>(null);
  const [revoke, setRevoke] = useState<{ id: string; label: string } | null>(null);
  const direct = secret && `${secret.url}#k=${encodeURIComponent(secret.password)}`;
  const message = secret && `${view.settings.name}
${direct}`;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try { setSecret(await act<Secret>("/links", { label, role })); setLabel(""); } catch {}
  };
  return (
    <Block title="Accès à l'organisation" sub="Un lien avec mot de passe pour qu'un co-organisateur voie les inscrits, les équipes et le tournoi.">
      {secret && (
        <div className="t-secret">
          <div><b>Accès « {secret.label} » créé</b><small>Le mot de passe ne sera plus affiché : envoie-le maintenant.</small></div>
          <div className="t-url"><span className="ellipsis">{direct}</span></div>
          <small className="muted">Lien direct : un clic et on est connecté. Mot de passe seul si besoin : <code>{secret.password}</code></small>
          <div className="row gap">
            <Button size="small" tone="primary" onClick={() => navigator.clipboard.writeText(message!).then(() => toast("Message copié"))}><Copy size={14} />Copier le lien</Button>
            {"share" in navigator && <Button size="small" onClick={() => navigator.share({ text: message! }).catch(() => {})}><Share2 size={14} />Envoyer</Button>}
            <Button size="small" tone="quiet" onClick={() => setSecret(null)}>Fermer</Button>
          </div>
        </div>
      )}
      <form className="t-inline-form" onSubmit={create}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pour qui ? Ex. Léa" maxLength={40} />
        <Segmented label="Droits" active={role} onChange={setRole} items={[{ id: "manage", label: "Peut gérer" }, { id: "view", label: "Lecture" }]} />
        <Button tone="primary" type="submit"><Plus size={15} />Créer le lien</Button>
      </form>
      {view.links.length > 0 && (
        <DataTable label="Accès" rows={view.links} rowKey={(l) => l.id} columns={[
          { key: "label", label: "Accès", cell: (l) => <span className="t-name"><b>{l.label}</b><small>créé {ago(l.at)}</small></span> },
          { key: "role", label: "Droits", cell: (l) => <Pill tone={l.role === "view" ? "muted" : "ink"}>{l.role === "view" ? "Lecture" : "Gestion"}</Pill> },
          { key: "used", label: "Dernière connexion", phone: false, cell: (l) => <span className="muted">{l.lastUsed ? ago(l.lastUsed) : "jamais"}</span> },
          { key: "act", label: "", align: "right", cell: (l) => (
            <span className="row end">
              <Button size="small" tone="quiet" onClick={() => navigator.clipboard.writeText(`${view.publicUrl}/a/${l.token}`).then(() => toast("Lien copié, sans le mot de passe"))} aria-label="Copier le lien"><Copy size={14} /></Button>
              <Button size="small" tone="danger" onClick={() => setRevoke({ id: l.id, label: l.label })}>Révoquer</Button>
            </span>
          ) },
        ]} />
      )}
      {revoke && <Confirm title={`Révoquer « ${revoke.label} »`} text="Le lien cesse de marcher tout de suite." label="Révoquer" onConfirm={() => act("/links/revoke", { id: revoke.id }, "Accès révoqué")} onClose={() => setRevoke(null)} />}
    </Block>
  );
}
