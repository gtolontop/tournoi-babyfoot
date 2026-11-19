// Mots de passe (scrypt), sessions par cookie, et un limiteur par adresse.
import crypto from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { save, state, uid, type Session } from "./store.ts";
import { PUBLIC_URL } from "./logic.ts";

export function hashPass(p: string) {
  const salt = crypto.randomBytes(16);
  return `s1:${salt.toString("hex")}:${crypto.scryptSync(p, salt, 32).toString("hex")}`;
}
export function checkPass(p: unknown, h: string | null | undefined) {
  if (!h || typeof p !== "string") return false;
  const [, salt, hash] = h.split(":");
  const a = crypto.scryptSync(p, Buffer.from(salt, "hex"), 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function genPass() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = () => Array.from(crypto.randomBytes(4), (x) => abc[x % abc.length]).join("");
  return `${part()}-${part()}`;
}

const COOKIE = "tb_sid";
const MAX_AGE = 30 * 86400;

export function sessionOf(c: Context): (Session & { sid: string }) | null {
  const sid = getCookie(c, COOKIE);
  const s = sid ? state.sessions[sid] : undefined;
  if (!sid || !s || s.exp < Date.now()) return null;
  if (s.linkId) {
    const link = state.links.find((l) => l.id === s.linkId);
    if (!link || link.revoked) return null;
    s.role = link.role;
    s.label = link.label;
  }
  return { ...s, sid };
}

export function openSession(c: Context, data: Omit<Session, "exp">) {
  const sid = uid(24);
  const now = Date.now();
  for (const [k, v] of Object.entries(state.sessions)) if (v.exp < now) delete state.sessions[k];
  state.sessions[sid] = { ...data, exp: now + MAX_AGE * 1000 };
  save();
  setCookie(c, COOKIE, sid, { path: "/", httpOnly: true, sameSite: "Lax", secure: PUBLIC_URL.startsWith("https"), maxAge: MAX_AGE });
}
export function closeSession(c: Context, sid: string) {
  delete state.sessions[sid];
  save();
  deleteCookie(c, COOKIE, { path: "/" });
}

const buckets = new Map<string, { n: number; reset: number }>();
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) return buckets.set(key, { n: 1, reset: now + windowMs }), false;
  return ++b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();

export const ipOf = (c: Context) => c.req.header("cf-connecting-ip") || (c.env as any)?.incoming?.socket?.remoteAddress || "";
