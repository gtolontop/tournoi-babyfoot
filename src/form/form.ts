// Le script du formulaire public, mis en ligne dans la page : les services du midi se cochent vite (« pareil tous les
// jours », « comme moi » pour le coéquipier), un champ oublié tremble au lieu d'afficher un message, l'envoi se fait
// sans recharger. Sans script, le formulaire s'envoie quand même (POST /inscription).

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("f");
const err = $<HTMLParagraphElement>("err");
const go = $<HTMLButtonElement>("go");
const lbl = go.querySelector(".lbl")!;
// Mouvement réduit : pas de défilement animé.
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Une vibration à peine perceptible (Android seulement, ignorée ailleurs).
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* rien */ } };

const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const rows = (p: string) => [...form.querySelectorAll<HTMLElement>(`[data-lunch="${p}"] .day`)];
const boxes = (row: HTMLElement) => [...row.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
const filled = (p: string) => rows(p).filter((r) => boxes(r).some((b) => b.checked));
const copyBtn = (p: string) => form.querySelector<HTMLButtonElement>(`[data-copy="${p}"]`)!;
const syncCopy = (p: string) => { copyBtn(p).hidden = filled(p).length !== 1 || rows(p).length < 2; };
const copyRow = (from: HTMLElement, to: HTMLElement) => { const a = boxes(from); boxes(to).forEach((b, i) => { b.checked = a[i].checked; }); };

form.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  if (b.dataset.copy) {
    const p = b.dataset.copy, src = filled(p)[0];
    if (src) for (const r of rows(p)) copyRow(src, r);
    b.hidden = true;
  }
  if (b.hasAttribute("data-same")) {
    const his = rows("m");
    rows("l").forEach((r, i) => copyRow(r, his[i]));
    syncCopy("m");
  }
});

form.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.type === "checkbox") syncCopy((t.closest("[data-lunch]") as HTMLElement).dataset.lunch!);
  if (t.name === "mode" && t.value === "duo") field("mfirst").focus();
});

// Champ oublié : on y met le curseur et il tremble. Il redevient normal dès qu'on écrit dedans.
function shake(el: HTMLInputElement) {
  el.classList.remove("bad");
  void el.offsetWidth;
  el.classList.add("bad");
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  buzz(25);
}
form.addEventListener("input", (e) => (e.target as HTMLElement).classList.remove("bad"));

let hideTimer = 0;
function toast(msg: string) {
  err.textContent = msg;
  err.classList.add("on");
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => err.classList.remove("on"), 4000);
}

const lunchOf = (p: string) => {
  const out: Record<string, [number, number]> = {};
  for (const r of filled(p)) {
    const s = boxes(r).filter((b) => b.checked).map((b) => Number(b.value)).sort((a, b) => a - b);
    out[r.dataset.day!] = [s[0], s[s.length - 1] + 60];
  }
  return out;
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.classList.remove("on");
  const duo = (form.querySelector("input[name=mode]:checked") as HTMLInputElement).value === "duo";
  const need = ["first", "last", ...(duo ? ["mfirst", "mlast"] : [])].map(field).find((el) => !el.value.trim());
  if (need) return shake(need);

  const data: Record<string, unknown> = {};
  for (const k of ["first", "last", "contact", "mfirst", "mlast", "note", "website"]) data[k] = field(k).value;
  data.mode = duo ? "duo" : "solo";
  data.lunch = lunchOf("l");
  if (duo) data.mlunch = lunchOf("m");

  // Pendant l'envoi : le bouton garde sa place, un petit cercle tourne devant « Envoi… ».
  go.disabled = true;
  go.classList.add("busy");
  go.setAttribute("aria-busy", "true");
  lbl.textContent = "Envoi…";
  try {
    const r = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Une erreur est survenue.");
    $("done-title").textContent = j.title;
    $("done-text").textContent = j.text;
    const recap = $("recap");
    recap.replaceChildren(...(j.lines as [string, string][]).map(([k, v], i) => {
      const row = document.createElement("div");
      row.style.setProperty("--i", String(i)); // les lignes du récapitulatif arrivent en cascade
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      row.append(dt, dd);
      return row;
    }));
    recap.hidden = !j.lines.length;
    form.hidden = true;
    $("done").hidden = false;
    scrollTo(0, 0);
    buzz(12);
  } catch (x) {
    const m = (x as Error).message;
    if (/contact/i.test(m)) shake(field("contact"));
    toast(m === "Failed to fetch" ? "Connexion perdue, réessaie." : m);
  } finally {
    go.disabled = false;
    go.classList.remove("busy");
    go.removeAttribute("aria-busy");
    lbl.textContent = "S'inscrire";
  }
});

$<HTMLAnchorElement>("again").addEventListener("click", (e) => {
  e.preventDefault();
  form.reset();
  syncCopy("l");
  syncCopy("m");
  $("done").hidden = true;
  form.hidden = false;
  history.replaceState(null, "", "/");
  field("first").focus();
});
