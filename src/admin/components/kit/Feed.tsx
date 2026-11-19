import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "../../lib/ui";

// What happened, newest first (ActivityFeed), and where something stands among ordered steps (Steps). Styles: kit.css.

export type FeedItem = { key: string | number; icon?: ReactNode; title: ReactNode; meta?: ReactNode; at?: ReactNode; tone?: "ink" | "tint" | "ok" | "warn" | "muted"; onOpen?: () => void };
export function ActivityFeed({ items, empty, label }: { items: FeedItem[]; empty?: ReactNode; label: string }) {
  if (!items.length) return <p className="k-feed-empty">{empty ?? "Rien pour l'instant."}</p>;
  return (
    <ol className="k-feed" aria-label={label}>
      {items.map((it, i) => {
        const body = (
          <>
            <span className={cx("k-feed-dot", it.tone ?? "muted")} aria-hidden>{it.icon}</span>
            <span className="k-feed-text">
              <span className="k-feed-title">{it.title}</span>
              {it.meta && <span className="k-feed-meta">{it.meta}</span>}
            </span>
            {it.at && <time className="k-feed-at">{it.at}</time>}
          </>
        );
        return (
          <li key={it.key} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
            {it.onOpen ? <button type="button" className="k-feed-row" onClick={it.onOpen}>{body}</button> : <div className="k-feed-row">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// Ordered steps: done ones checked, the current one marked, the rest waiting. Vertical on the phone, across on a wide screen.
export type Step = { key: string; label: ReactNode; detail?: ReactNode; state: "done" | "current" | "todo" };
export function Steps({ steps, label, vertical }: { steps: Step[]; label: string; vertical?: boolean }) {
  return (
    <ol className={cx("k-steps", vertical && "vertical")} aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.key} className={s.state} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="k-step-mark" aria-hidden>{s.state === "done" ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
          <span className="k-step-text">
            <span>{s.label}</span>
            {s.detail && <small>{s.detail}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}
