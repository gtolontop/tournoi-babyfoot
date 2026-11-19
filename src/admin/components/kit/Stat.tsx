import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cx } from "../../lib/ui";
import { monotonePath, num } from "../../lib/chart";
import { useCountUp, useWidth } from "../../lib/motion";

// Figures: a number that counts up, the change pill (green when the change is good, whatever its direction), and a
// sparkline you can scrub: the card's number follows the finger, then comes back. Styles: styles/kit.css.

export function AnimatedNumber({ value, format = num }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span className="k-num">{format(shown)}</span>;
}

// « +3 », « −2 », « = ». `good` says which direction is good news (« up » by default).
export function Delta({ value, format = num, good = "up", suffix }: { value: number | null; format?: (n: number) => string; good?: "up" | "down"; suffix?: string }) {
  if (value == null) return <span className="k-delta none">pas encore de recul</span>;
  const tone = value === 0 ? "flat" : (value > 0) === (good === "up") ? "good" : "bad";
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("k-delta", tone)}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      <span>{value === 0 ? "stable" : `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`}</span>
      {suffix && <small>{suffix}</small>}
    </span>
  );
}

// `tips`: one sentence per point, shown in a tooltip beside the marker (« hier · 241 lectures »; a line break makes a
// second line). The mouse shows it while hovering; a tap shows it until a tap elsewhere; the arrows move it once the
// curve has the focus. The tooltip opens on its usual side, or on the other one when the page's fixed bars would hide it.
// `flags`: points worth a look (most reads failed, or were put off), drawn as a column behind the point.
// `marks`: thin upright lines at moments along the curve (0 is the first point, 1 the last), each with its own
// tooltip; `strong` draws it full height and darker, the others short and faint. Lines closer than a few pixels merge
// into one whose tooltip lists them, one per line (« 13 h 34  Voltaire… » when `when` and `what` are given).
// A finger reaches the nearest line within 12 px each side, and a second tap on it shows the point nearest the line;
// the arrows stop on each line, between the two points around it.
export type SparkMark = { at: number; strong?: boolean; tip: string; when?: string; what?: string };
type SparkProps = { values: number[]; labels?: string[]; tips?: string[]; flags?: ("failed" | "idle" | null)[]; marks?: SparkMark[]; height?: number; onScrub?: (i: number | null) => void; label: string; tone?: "ink" | "tint" };
const MERGE_PX = 7;
const MARK_LINES = 5;
const TOUCH_REACH = 12;
// « 13 nov. 13 h 34 » → « 13 nov. » and « 13 h 34 ».
const splitWhen = (w: string) => {
  const m = /^(.*?)\s*(\d{1,2} h(?: \d{2})?)$/.exec(w);
  return m ? { day: m[1], clock: m[2] } : { day: w, clock: "" };
};
// The page's fixed bars (the phone's top bar and tab bar) hide what slides under them.
function visibleBand() {
  let top = 0;
  let bottom = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>(".ui-topbar, .ui-tabs")) {
    const r = el.getBoundingClientRect();
    if (!r.height || getComputedStyle(el).display === "none") continue;
    if (r.top <= 1 && r.bottom > top) top = r.bottom;
    else if (r.bottom >= window.innerHeight - 1 && r.top < bottom) bottom = r.top;
  }
  return { top: top + 4, bottom: bottom - 4 };
}
export function Sparkline({ values, labels, tips, flags, marks, height = 44, onScrub, label, tone = "ink" }: SparkProps) {
  const [ref, width] = useWidth<HTMLDivElement>(200);
  const [at, setAt] = useState<number | null>(null);
  const [mark, setMark] = useState<number | null>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  // A tap leaves the point shown: the finger lifting fires a pointerleave that must not hide it.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!held) return;
    const away = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setHeld(false);
      setAt(null);
      setMark(null);
      onScrub?.(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [held, ref, onScrub]);
  // The tooltip stays whole on screen: on its usual side when it fits, otherwise on the other, otherwise where there
  // is more room. Measured before paint, then again on scroll and resize while it is open.
  useLayoutEffect(() => {
    const el = tipRef.current;
    const box = ref.current;
    if (!el || !box) return;
    const place = () => {
      delete el.dataset.side;
      const r = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const band = visibleBand();
      if (r.top >= band.top && r.bottom <= band.bottom) return;
      const below = r.top >= b.top + b.height / 2;
      const roomBelow = band.bottom - (b.bottom + 6);
      const roomAbove = b.top - 6 - band.top;
      const mine = below ? roomBelow : roomAbove;
      const other = below ? roomAbove : roomBelow;
      if (other >= r.height || other > mine) el.dataset.side = below ? "above" : "below";
    };
    place();
    window.addEventListener("scroll", place, { passive: true, capture: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [at, mark, width, ref]);
  const pts = useMemo(() => {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const n = Math.max(1, values.length - 1);
    return values.map((v, i): [number, number] => [(i / n) * width, 3 + (1 - (v - min) / span) * (height - 6)]);
  }, [values, width, height]);
  // Neighbours within a few pixels become one line: a morning of five updates is one mark, not a barcode.
  const groups = useMemo(() => {
    const out: { x: number; strong: boolean; xs: number[]; items: SparkMark[] }[] = [];
    for (const m of [...(marks ?? [])].sort((a, b) => a.at - b.at)) {
      const x = Math.max(0, Math.min(1, m.at)) * width;
      const last = out.at(-1);
      if (last && x - last.xs.at(-1)! < MERGE_PX) {
        last.xs.push(x);
        last.items.push(m);
        last.strong ||= Boolean(m.strong);
        last.x = (last.xs[0] + x) / 2;
      } else out.push({ x, strong: Boolean(m.strong), xs: [x], items: [m] });
    }
    return out;
  }, [marks, width]);
  // What the arrows stop on, left to right: every point, and every update line between the two points around it.
  const stops = useMemo(() => {
    const all = [...pts.map((p, i) => ({ x: p[0], point: i as number | null, mark: null as number | null })), ...groups.map((g, k) => ({ x: g.x, point: null as number | null, mark: k as number | null }))];
    return all.sort((a, b) => a.x - b.x || (a.mark == null ? -1 : 1));
  }, [pts, groups]);
  if (values.length < 2) return <div ref={ref} className="k-spark empty" style={{ height }} />;
  const line = monotonePath(pts);
  const area = `${line}L${width} ${height}L0 ${height}Z`;
  const step = width / (values.length - 1);
  const pointAt = (x: number) => Math.max(0, Math.min(values.length - 1, Math.round((x / width) * (values.length - 1))));
  const show = (point: number | null, k: number | null) => {
    setMark(k);
    setAt(point);
    onScrub?.(point);
  };
  const move = (x: number, touch: boolean, again = false) => {
    // An update line wins when the pointer is on it: a finger reaches 24 px around it, the nearest line first.
    const reach = touch ? TOUCH_REACH : 4;
    const near = groups.reduce<number | null>((best, g, k) => Math.abs(g.x - x) <= reach && (best == null || Math.abs(g.x - x) < Math.abs(groups[best].x - x)) ? k : best, null);
    // A second tap on the line already shown gives the point nearest it: today's point stays reachable under today's line.
    if (again && near != null && near === mark) return show(pointAt(groups[near].x), null);
    show(near == null ? pointAt(x) : null, near);
  };
  const leave = () => (setHeld(false), setAt(null), setMark(null), onScrub?.(null));
  const dot = at != null ? pts[at] : pts.at(-1)!;
  const shownMark = mark != null ? groups[mark] : null;
  const markDay = shownMark?.items[0].when ? splitWhen(shownMark.items[0].when).day : "";
  const markRows = shownMark?.items.map((m) => {
    if (!m.when) return { clock: "", title: m.tip };
    const w = splitWhen(m.when);
    return { clock: w.day === markDay ? w.clock : m.when, title: m.what ?? "" };
  });
  const slide = (x: number) => ({ left: x, translate: `${-(100 * x) / (width || 1)}% 0` });
  return (
    <div ref={ref} className={cx("k-spark", tone, (at != null || mark != null) && "scrub")} style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={0}
        onPointerMove={(e) => move(e.clientX - e.currentTarget.getBoundingClientRect().left, e.pointerType !== "mouse")}
        onPointerDown={(e) => (setHeld(e.pointerType !== "mouse"), move(e.clientX - e.currentTarget.getBoundingClientRect().left, e.pointerType !== "mouse", e.pointerType !== "mouse" && held))}
        onPointerLeave={(e) => e.pointerType === "mouse" && leave()}
        onFocus={() => tips && at == null && mark == null && setAt(values.length - 1)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const here = stops.findIndex((s) => (mark != null ? s.mark === mark : s.point === (at ?? values.length - 1)));
            const s = stops[Math.max(0, Math.min(stops.length - 1, here + (e.key === "ArrowLeft" ? -1 : 1)))];
            show(s.point, s.mark);
          } else if (e.key === "Escape") leave();
        }}
        onBlur={leave}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {flags?.map((f, i) => f && (
          <g key={i} className={cx("k-spark-odd", f)}>
            <rect x={Math.max(0, pts[i][0] - step / 2)} y={0} width={Math.min(width, pts[i][0] + step / 2) - Math.max(0, pts[i][0] - step / 2)} height={height} />
            <rect className="k-spark-odd-foot" x={Math.max(0, pts[i][0] - step / 2)} y={height - 2} width={Math.min(width, pts[i][0] + step / 2) - Math.max(0, pts[i][0] - step / 2)} height={2} />
          </g>
        ))}
        <path className="k-spark-area" d={area} fill={`url(#${id})`} />
        {groups.map((g, k) => (
          <g key={k} className={cx("k-spark-mark", g.strong && "strong", mark === k && "on", g.items.length > 1 && "many")}>
            {mark === k && <rect className="k-spark-mark-ring" x={g.x - 4.5} y={-4} width={9} height={height + 6} rx={4.5} />}
            <line x1={g.x} x2={g.x} y1={g.strong || mark === k ? 1 : Math.round(height * 0.6)} y2={height} />
            {(g.strong || mark === k) && <rect x={g.x - (g.items.length > 1 ? 2 : 1.25)} y={-1} width={g.items.length > 1 ? 4 : 2.5} height={3.5} rx={1.25} />}
          </g>
        ))}
        <path className="k-spark-line" d={line} pathLength={1} />
        {at != null && <line className="k-spark-rule" x1={dot[0]} x2={dot[0]} y1={0} y2={height} />}
        <circle className="k-spark-dot" cx={dot[0]} cy={dot[1]} r={3} />
      </svg>
      {at != null && !onScrub && labels?.[at] && <span className="k-spark-tip" style={{ left: Math.min(width - 60, Math.max(0, dot[0] - 30)) }}>{labels[at]}</span>}
      {/* Anchored on the marker and slid by its share of the width, so it never leaves the curve's box. */}
      {at != null && tips?.[at] && <span ref={tipRef} className="k-tip k-spark-tooltip" role="status" style={slide(dot[0])}>{tips[at]}</span>}
      {shownMark && markRows && <span ref={tipRef} className="k-tip k-spark-tooltip k-spark-marktip" role="status" style={slide(shownMark.x)}>
        <b>{shownMark.items.length > 1 ? `${shownMark.items.length} mises à jour` : "Mise à jour"}{markDay && ` · ${markDay}`}</b>
        {markRows.slice(0, MARK_LINES).map((r, k) => <span key={k} className="k-spark-markrow"><time>{r.clock}</time><span>{r.title}</span></span>)}
        {markRows.length > MARK_LINES && <span className="k-spark-markmore">+ {markRows.length - MARK_LINES} {markRows.length - MARK_LINES > 1 ? "autres" : "autre"}</span>}
      </span>}
    </div>
  );
}

export type StatProps = {
  label: string;
  value: number;
  format?: (n: number) => string;
  delta?: { value: number | null; good?: "up" | "down"; suffix?: string };
  series?: number[];
  labels?: string[];
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "ink" | "tint";
  // What sits where the sparkline would, for a figure without a history (a rate bar, a split).
  chart?: ReactNode;
};
export function StatCard({ label, value, format = num, delta, series, labels, hint, icon, tone, chart }: StatProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub != null && series ? series[scrub] : value;
  return (
    <div className="k-stat">
      <div className="k-stat-head">
        {icon && <span className="k-stat-icon" aria-hidden>{icon}</span>}
        <span className="k-stat-label">{label}</span>
      </div>
      <div className="k-stat-value" aria-live="polite">
        {scrub != null ? <span className="k-num">{format(shown)}</span> : <AnimatedNumber value={value} format={format} />}
      </div>
      <div className="k-stat-foot">
        {scrub != null && labels ? <span className="k-delta none">{labels[scrub]}</span> : delta ? <Delta value={delta.value} format={format} good={delta.good} suffix={delta.suffix} /> : null}
        {hint && scrub == null && <span className="k-stat-hint">{hint}</span>}
      </div>
      {series && series.length > 1 ? <Sparkline values={series} labels={labels} onScrub={setScrub} label={`${label} : évolution`} tone={tone} /> : chart && <div className="k-stat-chart">{chart}</div>}
    </div>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("k-stat-grid", className)}>{children}</div>;
}
