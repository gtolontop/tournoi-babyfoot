import type { ReactNode } from "react";
import { cx } from "../../lib/ui";

// The containers every page builds on: a block (titled card), the status dot, and a plain skeleton surface. The page
// skeletons are in kit/Skeleton.tsx. Styles: kit.css.

export function Block({ title, sub, aside, children, className, id, flush }: { title?: ReactNode; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string; flush?: boolean }) {
  return (
    <section id={id} className={cx("k-block", flush && "flush", className)}>
      {(title || aside) && (
        <header className="k-block-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {aside && <div className="k-block-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Dot({ tone = "muted", pulse, label }: { tone?: "ok" | "warn" | "danger" | "tint" | "muted" | "ink"; pulse?: boolean; label?: string }) {
  return <i className={cx("k-dot", tone, pulse && "pulse")} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function Badge({ tone = "muted", children }: { tone?: "ok" | "warn" | "danger" | "tint" | "muted" | "ink"; children: ReactNode }) {
  return <span className={cx("k-badge", tone)}>{children}</span>;
}

export function Skeleton({ h = 16, w, r }: { h?: number; w?: number | string; r?: number }) {
  return <i className="k-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}
