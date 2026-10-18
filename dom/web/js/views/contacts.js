// Kontakte: Kunden, Lieferanten, Handwerker, Speditionen.
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import { empty, errorToast, esc, formSheet, header, navButton, segmented } from "../ui.js";

export const CONTACT_KIND = { kunde: "Kunde", lieferant: "Lieferant", handwerker: "Handwerker", spedition: "Spedition", sonstige: "Sonstige" };
const TINT = { kunde: "var(--system-blue)", lieferant: "var(--system-orange)", handwerker: "var(--system-brown)", spedition: "var(--system-teal)", sonstige: "var(--system-gray)" };

export function contactSheet(contact = null, kind = "lieferant") {
  return formSheet({
    title: contact ? "Kontakt" : "Neuer Kontakt",
    confirm: contact ? "Sichern" : "Hinzufügen",
    values: contact ?? { kind },
    sections: [
      { fields: [
        { name: "kind", label: "Art", type: "select", options: Object.entries(CONTACT_KIND) },
        { name: "company", label: "Firma", required: true, autocomplete: "organization" },
        { name: "name", label: "Ansprechpartner", autocomplete: "name" },
        { name: "trade", label: "Gewerk / Sortiment", placeholder: "z. B. Tischler, Trockenbau, Bürostühle" },
      ] },
      { fields: [
        { name: "email", label: "E-Mail", type: "email", autocomplete: "email" },
        { name: "phone", label: "Telefon", type: "tel", autocomplete: "tel" },
        { name: "address", label: "Adresse", autocomplete: "street-address" },
      ] },
      { fields: [{ name: "notes", label: "Notizen", type: "textarea", rows: 3, placeholder: "z. B. Rabattkonditionen, Lieferzeiten, Erfahrungen" }] },
    ],
    destructive: contact ? { label: "Kontakt löschen", confirmTitle: `„${contact.company ?? contact.name}“ löschen?`, onConfirm: () => q(db.from("contacts").delete().eq("id", contact.id)) } : null,
    onSubmit: (v) => contact ? q(db.from("contacts").update(v).eq("id", contact.id)) : q(db.from("contacts").insert(v)),
  });
}

export default async function contacts(ctx) {
  const filter = ctx.query.get("art") ?? "alle";
  let query = db.from("contacts").select("*").order("company");
  if (filter !== "alle") query = query.eq("kind", filter);
  const rows = await q(query);

  ctx.root.innerHTML = `
    ${header({ title: "Kontakte", actions: navButton("add", "plus", "Neuer Kontakt") })}
    <div class="page">
      ${segmented("art", [["alle", "Alle"], ["kunde", "Kunden"], ["lieferant", "Lieferanten"], ["handwerker", "Handwerker"]], filter)}
      <label class="search">${icon("search", "sm")}<span class="sr-only">Kontakte suchen</span><input type="search" placeholder="Firma, Name oder Gewerk" data-search></label>
      ${rows.length ? `<ul class="list with-icons" data-list>${rows.map((c) => `<li data-text="${esc(`${c.company} ${c.name} ${c.trade}`.toLowerCase())}">
        <div class="cell"><button class="cell-main" data-contact="${c.id}"><span class="cell-icon" style="--tint:${TINT[c.kind]}">${icon(c.kind === "kunde" ? "building" : c.kind === "spedition" ? "truck" : "person")}</span>
        <span class="cell-text"><span class="cell-title">${esc(c.company ?? c.name)}</span><span class="cell-sub">${[CONTACT_KIND[c.kind], c.trade, c.name && c.company ? c.name : ""].filter(Boolean).map(esc).join(" · ")}</span></span>
        </button>
        <span class="cell-actions">${c.phone ? `<a class="icon-btn" href="tel:${esc(c.phone)}" aria-label="${esc(c.company ?? c.name)} anrufen">${icon("phone")}</a>` : ""}${c.email ? `<a class="icon-btn" href="mailto:${esc(c.email)}" aria-label="E-Mail an ${esc(c.company ?? c.name)}">${icon("mail")}</a>` : ""}</span>
        </div></li>`).join("")}</ul>`
      : empty({ icon: "contacts", title: "Keine Kontakte", text: "Lege Kunden, Möbellieferanten, Handwerksbetriebe und Speditionen an – für Ausschreibungen und E-Mails.",
          action: '<button class="btn btn-filled" data-action="add">Kontakt anlegen</button>' })}
    </div>`;

  ctx.root.querySelector("[data-search]").addEventListener("input", (e) => {
    const s = e.target.value.toLowerCase();
    ctx.root.querySelectorAll("[data-list] > li").forEach((li) => { li.hidden = s && !li.dataset.text.includes(s); });
  });
  ctx.root.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-seg] button");
    if (seg) { location.hash = `#/kontakte?art=${seg.dataset.value}`; return; }
    try {
      const c = e.target.closest("[data-contact]");
      if (c && await contactSheet(rows.find((x) => x.id === c.dataset.contact))) return ctx.rerender();
      if (e.target.closest('[data-action="add"]') && await contactSheet(null, filter !== "alle" ? filter : "lieferant")) ctx.rerender();
    } catch (err) { errorToast(err); }
  });
}
