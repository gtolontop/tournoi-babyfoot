import type { ReactNode } from "react";
import { AtSign, Mail, Phone } from "lucide-react";
import type { Contact, View } from "../../shared/types";
import { DAY_NAMES, DAY_SHORT, fmt, steps, type Lunch } from "../../shared/lunch";
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

// L'éditeur de pause du midi de la fiche joueur : une ligne par jour, deux heures.
export function LunchEditor({ value, onChange, days, from, to }: { value: Lunch; onChange: (l: Lunch) => void; days: number[]; from: number; to: number }) {
  const opts = steps(from, to, 15);
  const set = (d: number, i: 0 | 1, v: string) => {
    const next = { ...value };
    if (!v) delete next[d];
    else {
      const r: [number, number] = value[d] ? [value[d]![0], value[d]![1]] : [from, from];
      r[i] = Number(v);
      if (i === 0 && (!value[d] || r[1] <= r[0])) r[1] = Math.min(to, r[0] + 60);
      if (i === 1 && (!value[d] || r[0] >= r[1])) r[0] = Math.max(from, r[1] - 60);
      next[d] = r;
    }
    onChange(next);
  };
  return (
    <div className="t-lunch">
      {days.map((d) => (
        <div key={d} className={cx("t-lunch-row", value[d] && "on")}>
          <span>{DAY_NAMES[d]}</span>
          {([0, 1] as const).map((i) => (
            <select key={i} aria-label={`${DAY_NAMES[d]} ${i ? "fin" : "début"}`} value={value[d]?.[i] ?? ""} onChange={(e) => set(d, i, e.target.value)}>
              <option value="">—</option>
              {opts.map((m) => <option key={m} value={m}>{fmt(m)}</option>)}
            </select>
          ))}
        </div>
      ))}
    </div>
  );
}

// Qui mange quand : une ligne par jour, une case par quart d'heure, plus foncée quand plus de joueurs sont là.
export function Heat({ heat, best }: { heat: View["heat"]; best: View["best"] }) {
  const max = Math.max(1, ...heat.days.flatMap((d) => d.counts));
  const ticks = steps(heat.from, heat.to, 60);
  return (
    <div className="t-heat">
      <div className="t-heat-row t-heat-ticks">
        <span />
        <div>{ticks.map((m) => <i key={m} style={{ left: `${((m - heat.from) / (heat.to - heat.from)) * 100}%` }}>{fmt(m)}</i>)}</div>
      </div>
      {heat.days.map((d) => (
        <div key={d.day} className="t-heat-row">
          <span>{DAY_SHORT[d.day]}<small className="k-num">{d.players}</small></span>
          <div>
            {d.counts.map((c, i) => {
              const m = heat.from + i * heat.step;
              const inBest = best && best.day === d.day && m >= best.s && m < best.e;
              return <i key={i} className={cx(inBest && "best", !c && "empty")} style={c ? { opacity: 0.14 + (c / max) * 0.86 } : undefined} title={`${DAY_NAMES[d.day]} ${fmt(m)} : ${c} joueur${c > 1 ? "s" : ""}`} />;
            })}
          </div>
        </div>
      ))}
    </div>
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
