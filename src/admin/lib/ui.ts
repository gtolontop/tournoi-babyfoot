// Petits outils d'affichage partagés.
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
export const clock = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n > 1 ? many : one}`;
export const initials = (name: string) => name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
