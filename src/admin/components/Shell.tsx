import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, LogOut, QrCode, Settings, Trophy, UserRound, UsersRound } from "lucide-react";
import { useStore } from "../lib/api";
import { Button } from "./ui";

// La coque de Facade : le menu à gauche sur l'ordinateur ; sur le téléphone, une barre en haut et les écrans en
// onglets en bas.
const MENU = [
  { to: "/", label: "Aperçu", icon: LayoutGrid, end: true },
  { to: "/joueurs", label: "Joueurs", icon: UserRound },
  { to: "/equipes", label: "Équipes", icon: UsersRound },
  { to: "/tournoi", label: "Tournoi", icon: Trophy },
  { to: "/partage", label: "Partage", icon: QrCode },
];

export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Brand({ name }: { name: string }) {
  return (
    <span className="brand-mark">
      <Mark />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

export function Shell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const { view, canEdit } = useStore();
  const badge = (to: string) => {
    if (to === "/joueurs" && view.stats.solo) return <span className="ui-count" title="Sans coéquipier">{view.stats.solo}</span>;
    return null;
  };
  const role = view.me.role === "admin" ? "Admin" : view.me.role === "view" ? `${view.me.label} · lecture` : view.me.label;
  return (
    <div className="ui-shell">
      <aside className="ui-side">
        <div className="brand"><Brand name={view.settings.name} /></div>
        <nav className="ui-nav">
          {[...MENU, ...(canEdit ? [{ to: "/reglages", label: "Réglages", icon: Settings }] : [])].map(({ to, label, icon: Icon, ...rest }) => (
            <div key={to} className="ui-nav-item">
              <NavLink to={to} end={"end" in rest}>
                <Icon size={16} strokeWidth={1.8} />
                <span>{label}</span>
                {badge(to)}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="ui-side-foot t-account">
          <span className="t-account-who">
            <b>{role}</b>
            <small>{view.settings.open ? "Inscriptions ouvertes" : "Inscriptions fermées"}</small>
          </span>
          <Button tone="quiet" size="small" onClick={onLogout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={15} /></Button>
        </div>
      </aside>
      <main className="ui-main">
        <div className="ui-topbar">
          <Brand name={view.settings.name} />
          <div className="row gap">
            {canEdit && <NavLink to="/reglages" className="ui-btn quiet" aria-label="Réglages"><Settings size={18} /></NavLink>}
            <Button tone="quiet" onClick={onLogout} aria-label="Se déconnecter"><LogOut size={17} /></Button>
          </div>
        </div>
        {children}
      </main>
      <nav className="ui-tabs">
        {MENU.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={"end" in rest}>
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
            {badge(to)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
