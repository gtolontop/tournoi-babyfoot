import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Motion without a library: a real spring for numbers and chart shapes, a count-up for figures, and the reduced-motion
// switch. Spring presets follow the CSS tokens (styles/tokens.css): smooth 300/30, snappy 400/25, gentle 180/24.

export const SPRING = { smooth: { stiffness: 300, damping: 30 }, snappy: { stiffness: 400, damping: 25 }, gentle: { stiffness: 180, damping: 24 } } as const;
type Spring = { stiffness: number; damping: number; mass?: number };

const query = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
export function useReducedMotion() {
  const [reduce, setReduce] = useState(() => Boolean(query?.matches));
  useEffect(() => {
    if (!query) return;
    const on = () => setReduce(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return reduce;
}

// Values that follow their target on a spring, frame by frame. Arrays morph point by point (same length expected:
// see resample in chart.ts). The first values can start from `from` (0 for a count-up, the target otherwise).
export function useSpring<T extends number | number[]>(target: T, spring: Spring = SPRING.smooth, from?: T): T {
  const reduce = useReducedMotion();
  const list = (v: T) => (Array.isArray(v) ? v : [v]) as number[];
  const [value, setValue] = useState<T>(() => (reduce || from === undefined ? target : from));
  const state = useRef({ x: list(reduce || from === undefined ? target : from), v: list(target).map(() => 0) });
  const key = list(target).join(",");
  useLayoutEffect(() => {
    const goal = list(target);
    const s = state.current;
    if (reduce || s.x.length !== goal.length) {
      s.x = [...goal];
      s.v = goal.map(() => 0);
      setValue(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const { stiffness, damping, mass = 1 } = spring;
    const step = (now: number) => {
      // Fixed small steps keep the spring stable on a slow frame.
      let dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      let moving = false;
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        for (let i = 0; i < goal.length; i++) {
          const a = (-stiffness * (s.x[i] - goal[i]) - damping * s.v[i]) / mass;
          s.v[i] += a * h;
          s.x[i] += s.v[i] * h;
        }
        dt -= h;
      }
      for (let i = 0; i < goal.length; i++) {
        const scale = Math.max(1, Math.abs(goal[i]));
        if (Math.abs(s.x[i] - goal[i]) > scale * 0.0005 || Math.abs(s.v[i]) > scale * 0.005) moving = true;
        else (s.x[i] = goal[i]), (s.v[i] = 0);
      }
      setValue((Array.isArray(target) ? [...s.x] : s.x[0]) as T);
      if (moving) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduce]);
  return value;
}

// A figure that counts up from zero the first time it shows, then glides to each new value (ease-out, 0.9 s).
export function useCountUp(value: number, duration = 900) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) return void ((from.current = value), setShown(value));
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 4);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);
  return shown;
}

// The width of an element, followed as it changes: charts draw at their real size, in pixels.
export function useWidth<T extends HTMLElement>(initial = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A box not laid out yet (hidden, or in a row still sizing) keeps the last width instead of collapsing to zero.
    const update = () => { const w = Math.round(el.clientWidth); if (w > 0) setWidth(w); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width] as const;
}

// The theme: the device's, or the one forced from the account menu (kept on this device only).
export type Theme = "auto" | "light" | "dark";
const KEY = "tournoi.theme";
export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}
export function setTheme(theme: Theme) {
  try {
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* private mode: the choice lasts until the page closes */ }
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

// The theme actually on screen, light or dark: the forced one, else the device's. It follows both while the page is open.
const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const resolved = () => {
  const forced = document.documentElement.dataset.theme;
  return forced === "dark" || (forced !== "light" && Boolean(darkQuery?.matches));
};
export function useDark() {
  const [dark, setDark] = useState(resolved);
  useEffect(() => {
    const update = () => setDark(resolved());
    const watch = new MutationObserver(update);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    darkQuery?.addEventListener("change", update);
    return () => (watch.disconnect(), darkQuery?.removeEventListener("change", update));
  }, []);
  return dark;
}

// The phone layout (the same breakpoint as the CSS): bottom sheets and cards instead of side panels and bubbles.
const phoneQuery = typeof window !== "undefined" ? window.matchMedia("(max-width: 760px)") : null;
export function usePhone() {
  const [phone, setPhone] = useState(() => Boolean(phoneQuery?.matches));
  useEffect(() => {
    const update = () => setPhone(Boolean(phoneQuery?.matches));
    phoneQuery?.addEventListener("change", update);
    return () => phoneQuery?.removeEventListener("change", update);
  }, []);
  return phone;
}
