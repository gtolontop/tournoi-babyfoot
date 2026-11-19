import { createContext, useContext } from "react";
import type { View } from "../../shared/types";

export class AuthError extends Error {}

export async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 401) throw new AuthError("Session expirée");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Erreur");
  return j as T;
}
export async function post<T = any>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== "/api/login") throw new AuthError(j.error || "Session expirée");
  if (!r.ok) throw new Error(j.error || "Erreur");
  return j as T;
}

// L'état du tournoi et l'action qui écrit : chaque écriture renvoie la vue à jour.
export type Store = {
  view: View;
  act: <T = any>(path: string, body?: unknown, ok?: string) => Promise<T>;
  toast: (msg: string, error?: boolean) => void;
  canEdit: boolean;
};
export const StoreContext = createContext<Store | null>(null);
export const useStore = () => useContext(StoreContext)!;
