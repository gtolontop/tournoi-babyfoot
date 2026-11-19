import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { View } from "../shared/types";
import { AuthError, get, post, StoreContext, type Store } from "./lib/api";
import { Shell } from "./components/Shell";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Players } from "./pages/Players";
import { Teams } from "./pages/Teams";
import { Tournament } from "./pages/Tournament";
import { Share } from "./pages/Share";
import { SettingsPage } from "./pages/Settings";

type Toast = { id: number; msg: string; error?: boolean };

export function App() {
  const [view, setView] = useState<View | null>(null);
  const [auth, setAuth] = useState<"loading" | "in" | "out">("loading");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const loc = useLocation();
  const navigate = useNavigate();
  const last = useRef("");

  const toast = useCallback((msg: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const apply = (v: View) => {
    const s = JSON.stringify(v);
    if (s !== last.current) { last.current = s; setView(v); }
  };
  const refresh = useCallback(async () => {
    try { apply(await get<View>("/api/state")); setAuth("in"); }
    catch (e) { if (e instanceof AuthError) setAuth("out"); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  // Plusieurs organisateurs en même temps : l'écran se met à jour tout seul.
  useEffect(() => {
    if (auth !== "in") return;
    const tick = () => !document.hidden && !document.querySelector(".ui-panel") && refresh();
    const id = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [auth, refresh]);

  const act = useCallback(async (path: string, body: unknown = {}, ok?: string) => {
    try {
      const j = await post(`/api${path}`, body);
      if (j.state) apply(j.state);
      if (ok) toast(ok);
      return j;
    } catch (e) {
      if (e instanceof AuthError) setAuth("out");
      toast((e as Error).message, true);
      throw e;
    }
  }, [toast]);

  const store = useMemo<Store | null>(() => (view ? { view, act, toast, canEdit: view.me.role !== "view" } : null), [view, act, toast]);

  const done = useCallback(() => { navigate("/", { replace: true }); refresh(); }, [navigate, refresh]);
  const token = /^\/acces\/([^/]+)/.exec(loc.pathname)?.[1];
  if (auth === "loading" && !token) return <div className="boot" />;
  if (auth !== "in" || !store || token) {
    return <Login token={token} signedIn={auth === "in"} onDone={done} />;
  }

  const logout = async () => { await post("/api/logout").catch(() => {}); setAuth("out"); setView(null); last.current = ""; };

  return (
    <StoreContext.Provider value={store}>
      <Shell onLogout={logout}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/joueurs" element={<Players />} />
          <Route path="/equipes" element={<Teams />} />
          <Route path="/tournoi" element={<Tournament />} />
          <Route path="/partage" element={<Share />} />
          <Route path="/reglages" element={<SettingsPage />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </Shell>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={t.error ? "toast error" : "toast"}>{t.msg}</div>)}
      </div>
    </StoreContext.Provider>
  );
}
