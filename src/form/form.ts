// Le script du formulaire public, mis en ligne dans la page : les pauses du midi se remplissent vite (fin proposée une
// heure après le début, « pareil tous les jours », « comme moi » pour le coéquipier), l'envoi se fait sans recharger.
// Sans script, le formulaire s'envoie quand même (POST /inscription).

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("f");
const err = $<HTMLParagraphElement>("err");
const go = $<HTMLButtonElement>("go");

const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const rows = (p: string) => [...form.querySelectorAll<HTMLElement>(`[data-lunch="${p}"] .day`)];
const pair = (row: HTMLElement) => row.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
// Un jour compte seulement si le début et la fin sont remplis ; sinon le joueur n'est pas là ce jour-là.
const filled = (p: string) => rows(p).filter((r) => { const [s, e] = pair(r); return s.value && e.value; });
const copyBtn = (p: string) => form.querySelector<HTMLButtonElement>(`[data-copy="${p}"]`)!;
const syncCopy = (p: string) => { copyBtn(p).hidden = filled(p).length !== 1 || rows(p).length < 2; };

// Choisir le début propose la fin une heure plus tard ; la fin ne peut pas précéder le début.
function onSelect(sel: HTMLSelectElement) {
  const row = sel.closest(".day") as HTMLElement;
  const [s, e] = pair(row);
  const opts = [...e.options].map((o) => o.value).filter(Boolean).map(Number);
  if (sel === s && s.value && (!e.value || Number(e.value) <= Number(s.value))) {
    const want = Number(s.value) + 60;
    e.value = String(opts.find((m) => m >= want) ?? opts[opts.length - 1]);
  } else if (sel === e && e.value && s.value && Number(s.value) >= Number(e.value)) {
    const want = Number(e.value) - 60;
    s.value = String([...opts].reverse().find((m) => m <= want) ?? opts[0]);
  }
  syncCopy((sel.closest("[data-lunch]") as HTMLElement).dataset.lunch!);
}

form.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  if (b.dataset.copy) {
    const p = b.dataset.copy;
    const src = filled(p)[0];
    if (!src) return;
    const [s, en] = pair(src);
    for (const r of rows(p)) { const [a, c] = pair(r); a.value = s.value; c.value = en.value; }
    b.hidden = true;
  }
  if (b.hasAttribute("data-same")) {
    const mine = rows("l"), his = rows("m");
    mine.forEach((r, i) => { const [a, c] = pair(r), [x, y] = pair(his[i]); x.value = a.value; y.value = c.value; });
    syncCopy("m");
  }
});

form.addEventListener("change", (e) => {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLSelectElement) onSelect(t);
  if (t instanceof HTMLInputElement && t.name === "mode" && t.value === "duo") field("mfirst").focus();
});

const fail = (msg: string, el?: HTMLElement) => {
  err.textContent = msg;
  err.classList.add("on");
  el?.focus();
};

const lunchOf = (p: string) => {
  const out: Record<string, [number, number]> = {};
  for (const r of filled(p)) { const [s, e] = pair(r); out[r.dataset.day!] = [Number(s.value), Number(e.value)]; }
  return out;
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.classList.remove("on");
  const data = Object.fromEntries(new FormData(form)) as Record<string, unknown>;
  const str = (k: string) => String(data[k] ?? "").trim();
  if (!str("first")) return fail("Indique ton prénom.", field("first"));
  if (!str("last")) return fail("Indique ton nom.", field("last"));
  const duo = data.mode === "duo";
  if (duo && !str("mfirst")) return fail("Indique le prénom de ton coéquipier.", field("mfirst"));
  if (duo && !str("mlast")) return fail("Indique le nom de ton coéquipier.", field("mlast"));
  for (const k of Object.keys(data)) if (/^[lm]\d[se]$/.test(k)) delete data[k];
  data.lunch = lunchOf("l");
  if (duo) data.mlunch = lunchOf("m");

  go.disabled = true;
  go.textContent = "Envoi…";
  try {
    const r = await fetch("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Une erreur est survenue.");
    $("done-title").textContent = j.title;
    $("done-text").textContent = j.text;
    const recap = $("recap");
    recap.replaceChildren(...(j.lines as [string, string][]).map(([k, v]) => {
      const row = document.createElement("div");
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
  } catch (x) {
    fail((x as Error).message === "Failed to fetch" ? "Connexion perdue, réessaie." : (x as Error).message);
  } finally {
    go.disabled = false;
    go.textContent = "S'inscrire";
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
