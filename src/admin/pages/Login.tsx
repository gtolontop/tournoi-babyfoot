import { useEffect, useState, type FormEvent } from "react";
import { get, post } from "../lib/api";
import { Brand } from "../components/Shell";

export function Login({ token, signedIn, onDone }: { token?: string; signedIn: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ name: string; label?: string } | null>(null);
  const [dead, setDead] = useState("");

  useEffect(() => {
    if (token) get<{ name: string; label: string }>(`/api/link/${token}`).then(setMeta).catch((e) => setDead(e.message));
    else get<{ name: string }>("/api/meta").then(setMeta).catch(() => setMeta({ name: "Tournoi" }));
  }, [token]);
  // Déjà connecté en admin : le lien partagé n'a pas besoin de mot de passe.
  useEffect(() => { if (token && signedIn) onDone(); }, [token, signedIn, onDone]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/login", { password, token });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <div className="brand"><Brand name={meta?.name ?? ""} /></div>
        <div className="login-head">
          <h1>{token ? "Accès partagé" : "Organisation"}</h1>
          <p>{dead || (token ? `Entre le mot de passe reçu${meta?.label ? ` pour « ${meta.label} »` : ""}.` : "Entre le mot de passe admin.")}</p>
        </div>
        {!dead && (
          <>
            <label className="login-field">
              <span>Mot de passe</span>
              <input autoFocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit" disabled={busy || !password}>Entrer</button>
          </>
        )}
      </form>
    </div>
  );
}
