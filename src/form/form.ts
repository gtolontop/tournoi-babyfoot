// Le script du formulaire public, mis en ligne dans la page : le champ de contact suit le type choisi, l'envoi se fait
// sans recharger. Sans script, le formulaire s'envoie quand même (POST /inscription).

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("f");
const contact = $<HTMLInputElement>("contact");
const err = $<HTMLParagraphElement>("err");
const go = $<HTMLButtonElement>("go");

const KINDS = {
  insta: { placeholder: "@pseudo", type: "text", mode: "text", auto: "off" },
  tel: { placeholder: "06 12 34 56 78", type: "tel", mode: "tel", auto: "tel" },
  email: { placeholder: "prenom@exemple.fr", type: "email", mode: "email", auto: "email" },
} as const;
type Kind = keyof typeof KINDS;

const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
const radio = (name: string) => (form.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value ?? "";

function syncContact() {
  const k = KINDS[(radio("contactKind") as Kind) || "insta"];
  contact.placeholder = k.placeholder;
  contact.type = k.type;
  contact.inputMode = k.mode;
  contact.autocomplete = k.auto;
}
form.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name === "contactKind") { syncContact(); contact.focus(); }
  if (t.name === "mode" && t.value === "duo") field("mfirst").focus();
});
syncContact();

const fail = (msg: string, el?: HTMLElement) => {
  err.textContent = msg;
  err.classList.add("on");
  el?.focus();
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.classList.remove("on");
  const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
  if (!data.first.trim()) return fail("Indique ton prénom.", field("first"));
  if (!data.last.trim()) return fail("Indique ton nom.", field("last"));
  if (data.mode === "duo" && !data.mfirst.trim()) return fail("Indique le prénom de ton coéquipier.", field("mfirst"));
  if (data.mode === "duo" && !data.mlast.trim()) return fail("Indique le nom de ton coéquipier.", field("mlast"));
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
    $("intro").hidden = true;
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
  syncContact();
  $("done").hidden = true;
  form.hidden = false;
  $("intro").hidden = false;
  history.replaceState(null, "", "/");
  field("first").focus();
});
