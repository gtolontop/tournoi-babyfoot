// Le script du formulaire public, mis en ligne dans la page : la pause du midi se remplit vite (fin proposée une heure
// après le début, « pareil tous les jours »), l'envoi se fait sans recharger. Sans script, le formulaire s'envoie quand
// même (POST /inscription).

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("f");
const err = $<HTMLParagraphElement>("err");
const go = $<HTMLButtonElement>("go");
const copy = $<HTMLButtonElement>("copy");
const days = [...document.querySelectorAll<HTMLElement>("#lunch .day")];

const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const pair = (row: HTMLElement) => row.querySelectorAll("select") as NodeListOf<HTMLSelectElement>;
const filled = () => days.filter((r) => { const [s, e] = pair(r); return s.value && e.value; });

// Choisir le début propose la fin une heure plus tard ; la fin ne peut pas précéder le début.
function onSelect(sel: HTMLSelectElement) {
  const row = sel.closest(".day") as HTMLElement;
  const [s, e] = pair(row);
  const opts = [...e.options].map((o) => o.value).filter(Boolean).map(Number);
  if (sel === s) {
    if (!s.value) e.value = "";
    else if (!e.value || Number(e.value) <= Number(s.value)) {
      const want = Number(s.value) + 60;
      e.value = String(opts.find((m) => m >= want) ?? opts[opts.length - 1]);
    }
  } else if (e.value && (!s.value || Number(s.value) >= Number(e.value))) {
    const want = Number(e.value) - 60;
    s.value = String([...opts].reverse().find((m) => m <= want) ?? opts[0]);
  } else if (!e.value) s.value = "";
  copy.hidden = filled().length !== 1 || days.length < 2;
}

copy.addEventListener("click", () => {
  const src = filled()[0];
  if (!src) return;
  const [s, e] = pair(src);
  for (const r of days) { const [a, b] = pair(r); a.value = s.value; b.value = e.value; }
  copy.hidden = true;
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.classList.remove("on");
  const data = Object.fromEntries(new FormData(form)) as Record<string, unknown>;
  const str = (k: string) => String(data[k] ?? "").trim();
  if (!str("first")) return fail("Indique ton prénom.", field("first"));
  if (!str("last")) return fail("Indique ton nom.", field("last"));
  if (data.mode === "duo" && !str("mfirst")) return fail("Indique le prénom de ton coéquipier.", field("mfirst"));
  if (data.mode === "duo" && !str("mlast")) return fail("Indique le nom de ton coéquipier.", field("mlast"));
  const lunch: Record<string, [number, number]> = {};
  for (const r of filled()) { const [s, e] = pair(r); lunch[r.dataset.day!] = [Number(s.value), Number(e.value)]; }
  if (!Object.keys(lunch).length) return fail("Indique au moins un jour où tu manges.", pair(days[0])[0]);
  for (const k of Object.keys(data)) if (/^l\d[se]$/.test(k)) delete data[k];
  data.lunch = lunch;

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
  copy.hidden = true;
  $("done").hidden = true;
  form.hidden = false;
  history.replaceState(null, "", "/");
  field("first").focus();
});
