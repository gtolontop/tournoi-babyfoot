import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../../lib/ui";

// Tabs whose indicator slides on a spring to the chosen one (role tablist, arrow keys), and the small segmented switch
// of a chart (role radiogroup). The indicator is measured, then moved with a CSS transform: styles/kit.css.

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

function useIndicator(active: string, deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    if (!el || !box.current) return setPos(null);
    const update = () => setPos({ x: el.offsetLeft, w: el.offsetWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
  return [box, pos] as const;
}

const step = <T extends string>(e: KeyboardEvent, items: { id: T }[], active: T, pick: (id: T) => void) => {
  const i = items.findIndex((t) => t.id === active);
  const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
  if (next == null) return;
  e.preventDefault();
  const id = items[(next + items.length) % items.length].id;
  pick(id);
  (e.currentTarget.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus();
};

export function Tabs<T extends string>({ items, active, onChange, label, className }: { items: TabItem<T>[]; active: T; onChange: (id: T) => void; label: string; className?: string }) {
  const [box, pos] = useIndicator(active, [items.length, items.map((t) => t.count).join()]);
  return (
    <div ref={box} className={cx("k-tabs", className)} role="tablist" aria-label={label} onKeyDown={(e) => step(e, items, active, onChange)}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" data-id={t.id} aria-selected={t.id === active} tabIndex={t.id === active ? 0 : -1} className={cx(t.id === active && "on")} onClick={() => onChange(t.id)}>
          <span>{t.label}</span>
          {t.count != null && <small className="k-num">{t.count}</small>}
        </button>
      ))}
      {pos && <i className="k-tabs-ink" style={{ transform: `translateX(${pos.x}px)`, width: pos.w }} aria-hidden />}
    </div>
  );
}

export function Segmented<T extends string>({ items, active, onChange, label }: { items: TabItem<T>[]; active: T; onChange: (id: T) => void; label: string }) {
  const [box, pos] = useIndicator(active, [items.length]);
  return (
    <div ref={box} className="k-seg" role="radiogroup" aria-label={label} onKeyDown={(e) => step(e, items, active, onChange)}>
      {pos && <i className="k-seg-ink" style={{ transform: `translateX(${pos.x}px)`, width: pos.w }} aria-hidden />}
      {items.map((t) => (
        <button key={t.id} type="button" role="radio" data-id={t.id} aria-checked={t.id === active} tabIndex={t.id === active ? 0 : -1} className={cx(t.id === active && "on")} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
