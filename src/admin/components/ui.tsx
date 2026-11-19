import { useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent as KeyEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "../lib/ui";

// Les composants de base, repris du dashboard Facade : bouton, panneau, état vide, pastille. Styles : styles/base.css.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "plain" | "quiet" | "danger"; size?: "small"; busy?: boolean };
export function Button({ tone = "plain", size, busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx("ui-btn", tone !== "plain" && tone, tone === "danger" && "quiet", size, className)} disabled={disabled || busy} {...rest}>
      {busy && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

// Par-dessus la page, à droite ; plein écran sur le téléphone. Échap ou un clic à côté le ferment.
export function Panel({ title, onClose, children, foot }: { title?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => opener?.focus();
  }, []);
  const keepFocus = (e: KeyEvent) => {
    if (e.key !== "Tab") return;
    const stops = [...box.current!.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")].filter((el) => el.offsetParent);
    const here = stops.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey ? here <= 0 : here === stops.length - 1) (e.preventDefault(), stops.at(e.shiftKey ? -1 : 0)?.focus());
  };
  return (
    <>
      <div className="ui-panel-back" onMouseDown={onClose} />
      <aside ref={box} className="ui-panel" role="dialog" aria-modal tabIndex={-1} onKeyDown={keepFocus}>
        <div className="ui-panel-bar">
          <span className="ui-panel-title">{title}</span>
          <Button tone="quiet" size="small" onClick={onClose} aria-label="Fermer"><X size={16} /></Button>
        </div>
        <div className="ui-panel-body">{children}</div>
        {foot && <div className="ui-panel-foot">{foot}</div>}
      </aside>
    </>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Pill({ tone, children, title }: { tone?: "ok" | "tint" | "ink" | "muted"; children: ReactNode; title?: string }) {
  return <span className={cx("ui-pill", tone)} title={title}>{children}</span>;
}

export function Head({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ui-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row gap">{children}</div>}
    </header>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="t-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Switch({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="t-switch">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Confirm({ title, text, label, onConfirm, onClose, danger = true }: { title: string; text: ReactNode; label: string; onConfirm: () => Promise<unknown> | void; onClose: () => void; danger?: boolean }) {
  return (
    <Panel title={title} onClose={onClose} foot={<>
      <Button tone={danger ? "danger" : "primary"} className={danger ? "t-danger-solid" : ""} onClick={async () => { await onConfirm(); onClose(); }}>{label}</Button>
      <Button tone="quiet" onClick={onClose}>Annuler</Button>
    </>}>
      <div className="t-panel-pad"><p className="muted">{text}</p></div>
    </Panel>
  );
}
