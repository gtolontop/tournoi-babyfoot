import type { ReactNode } from "react";
import { AtSign, Mail, Phone } from "lucide-react";
import type { Contact } from "../../shared/types";
import { cx } from "../lib/ui";

// Petits morceaux partagés par les écrans : le contact cliquable, les barres, une ligne d'action.

export const CONTACT = {
  insta: { label: "Instagram", icon: AtSign, href: (v: string) => `https://instagram.com/${encodeURIComponent(v)}`, show: (v: string) => "@" + v },
  tel: { label: "Téléphone", icon: Phone, href: (v: string) => `tel:${v.replace(/[^\d+]/g, "")}`, show: (v: string) => v },
  email: { label: "Email", icon: Mail, href: (v: string) => `mailto:${v}`, show: (v: string) => v },
} as const;

export function ContactLink({ c }: { c: Contact | null }) {
  if (!c) return <span className="muted">—</span>;
  const k = CONTACT[c.kind];
  const Icon = k.icon;
  return (
    <a className="t-contact" href={k.href(c.value)} target={c.kind === "insta" ? "_blank" : undefined} rel="noreferrer" title={k.label}>
      <Icon size={13} strokeWidth={2} />
      <span className="ellipsis">{k.show(c.value)}</span>
    </a>
  );
}

export function Bars({ rows, highlight }: { rows: { key: string; label: string; players: number }[]; highlight?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.players));
  return (
    <div className="t-bars">
      {rows.map((r) => (
        <div key={r.key} className={cx("t-bar", r.key === highlight && "on")}>
          <span className="t-bar-label">{r.label}</span>
          <span className="t-bar-track"><i style={{ width: `${(r.players / max) * 100}%` }} /></span>
          <span className="t-bar-value k-num">{r.players}</span>
        </div>
      ))}
    </div>
  );
}

export function Todo({ icon, title, text, action }: { icon: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="t-todo">
      <span className="t-todo-icon" aria-hidden>{icon}</span>
      <span className="t-todo-text">
        <b>{title}</b>
        {text && <small>{text}</small>}
      </span>
      {action}
    </div>
  );
}

export function Avatar({ name, off }: { name: string; off?: boolean }) {
  return <span className={cx("t-avatar", off && "off")} aria-hidden>{name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>;
}
