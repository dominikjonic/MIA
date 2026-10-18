// Stückliste: Positionen nach Raum, Import (CSV/DXF), Export, Ausschreibung aus Auswahl.
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import { actionSheet, contentSheet, downloadFile, empty, errorToast, esc, eur, formSheet, header, navButton, num, toast } from "../ui.js";
import { itemsFromCSV, itemsFromDXF, itemsToCSV } from "../importers.js";

const SOURCES = { manuell: "Manuell", csv: "CSV", dxf: "AutoCAD (DXF)", sketchup: "SketchUp", blender: "Blender", autocad: "AutoCAD", ki: "Assistent" };

function itemSheet({ projectId, item = null, rooms = [] }) {
  return formSheet({
    title: item ? "Position" : "Neue Position",
    confirm: item ? "Sichern" : "Hinzufügen",
    values: item ?? { quantity: 1, unit: "Stk" },
    sections: [
      { fields: [
        { name: "name", label: "Bezeichnung", required: true, placeholder: "z. B. Schreibtisch elektr. 160×80" },
        { name: "quantity", label: "Menge", type: "number", required: true },
        { name: "unit", label: "Einheit", placeholder: "Stk, m², lfm" },
        { name: "room", label: "Raum", placeholder: rooms[0] ?? "z. B. Open Space" },
        { name: "category", label: "Kategorie", placeholder: "Arbeitsplatz, Stauraum, Akustik …" },
      ] },
      { header: "Produkt", fields: [
        { name: "manufacturer", label: "Hersteller" },
        { name: "article_no", label: "Artikelnummer" },
        { name: "unit_price_est", label: "Budgetpreis", type: "money", suffix: "€ / Einheit" },
      ] },
      { fields: [{ name: "notes", label: "Notizen", type: "textarea", rows: 2 }] },
    ],
    destructive: item ? { label: "Position löschen", confirmTitle: "Position löschen?", onConfirm: () => q(db.from("items").delete().eq("id", item.id)) } : null,
    onSubmit: (v) => {
      const row = { ...v, project_id: projectId };
      return item ? q(db.from("items").update(row).eq("id", item.id)) : q(db.from("items").insert(row));
    },
  });
}

async function importFlow(projectId, rerender) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.txt,.dxf,.tsv";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const isDxf = /\.dxf$/i.test(file.name) || text.slice(0, 200).includes("SECTION");
      const { items, columns } = isDxf ? itemsFromDXF(text) : itemsFromCSV(text);
      const guess = isDxf ? "dxf" : /sketchup|skp/i.test(file.name) ? "sketchup" : /acad|autocad|extrakt|extract/i.test(file.name) ? "autocad" : "csv";
      const res = await formSheet({
        title: "Stückliste importieren",
        confirm: `${items.length} übernehmen`,
        wide: true,
        values: { source: guess, replace: true },
        sections: [
          { header: file.name, html: `<div class="table-wrap" style="max-height:44vh"><table class="data"><thead><tr><th>Bezeichnung</th><th>Raum</th><th class="r">Menge</th><th>Hersteller</th><th class="r">Preis</th></tr></thead>
            <tbody>${items.slice(0, 200).map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.room ?? "")}</td><td class="r">${num(i.quantity)}</td><td>${esc(i.manufacturer ?? "")}</td><td class="r">${i.unit_price_est != null ? eur(i.unit_price_est, true) : ""}</td></tr>`).join("")}</tbody></table></div>`,
            footer: `Erkannte Spalten: ${esc(columns.join(" · "))}` },
          { fields: [
            { name: "source", label: "Quelle", type: "select", options: Object.entries(SOURCES).filter(([k]) => k !== "manuell" && k !== "ki") },
            { name: "replace", label: "Frühere Importe dieser Quelle ersetzen", type: "switch" },
          ], footer: "So kannst du nach jeder Planänderung neu exportieren und importieren, ohne doppelte Positionen. Manuell erfasste Positionen bleiben unberührt." },
        ],
        onSubmit: async (v) => {
          if (v.replace) await q(db.from("items").delete().eq("project_id", projectId).eq("source", v.source));
          const rows = items.map((i, n) => ({
            project_id: projectId, name: i.name.slice(0, 200), quantity: i.quantity ?? 1, unit: i.unit ?? "Stk", room: i.room ?? null,
            category: i.category ?? null, manufacturer: i.manufacturer ?? null, article_no: i.article_no ?? null,
            unit_price_est: i.unit_price_est ?? null, source: v.source, position: n,
          }));
          for (let k = 0; k < rows.length; k += 500) await q(db.from("items").insert(rows.slice(k, k + 500)));
          return rows.length;
        },
      });
      if (res) { toast(`${res} Positionen importiert`); rerender(); }
    } catch (e) { errorToast(e); }
  };
  input.click();
}

function helpSheet() {
  contentSheet({
    title: "Aus CAD übernehmen",
    html: `<div class="stack">
      <section class="group"><h3 class="group-header small">SketchUp</h3><div class="card t-subhead">
        Mit der <b>DOM-Erweiterung</b> (Einstellungen → Konnektoren → SketchUp) sendest du die Stückliste direkt aus SketchUp: <i>Erweiterungen → DOM → Stückliste senden</i>.<br><br>
        Ohne Erweiterung: <i>Datei → Bericht generieren → Komponenten</i> als CSV speichern und hier importieren.</div></section>
      <section class="group"><h3 class="group-header small">AutoCAD</h3><div class="card t-subhead">
        Befehl <code>DATENEXTRAKTION</code> (DATAEXTRACTION) → Blöcke mit Name, Anzahl und Layer → als CSV ausgeben und hier importieren.<br><br>
        Oder die Zeichnung als <b>DXF</b> speichern: DOM zählt alle Blöcke und nutzt den Layer als Raum.</div></section>
      <section class="group"><h3 class="group-header small">Blender</h3><div class="card t-subhead">
        Über die <b>Desktop-Brücke</b> mit Blender-MCP: im Assistenten „Hol die Stückliste aus Blender“ schreiben – Objekte werden nach Name gezählt und übernommen.</div></section>
      <section class="group"><h3 class="group-header small">Excel</h3><div class="card t-subhead">Spalten wie Bezeichnung, Menge, Einheit, Raum, Hersteller, Artikelnummer, Preis werden automatisch erkannt (Trennzeichen ; oder ,).</div></section>
    </div>`,
  });
}

export default async function items(ctx) {
  const id = ctx.params[0];
  const selecting = ctx.query.get("auswahl") === "1";
  const [p, rows] = await Promise.all([
    q(db.from("projects").select("id, name").eq("id", id).single()),
    q(db.from("items").select("*").eq("project_id", id).order("room", { nullsFirst: false }).order("position")),
  ]);
  const byRoom = new Map();
  for (const r of rows) {
    const k = r.room ?? "Ohne Raum";
    if (!byRoom.has(k)) byRoom.set(k, []);
    byRoom.get(k).push(r);
  }
  const total = rows.reduce((s, r) => s + Number(r.quantity) * Number(r.unit_price_est ?? 0), 0);
  const pieces = rows.filter((r) => r.unit === "Stk").reduce((s, r) => s + Number(r.quantity), 0);

  ctx.root.innerHTML = `
    ${header({ title: "Stückliste", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name },
      actions: selecting ? `<button class="btn btn-plain bold" data-action="cancel-select">Fertig</button>`
        : `${navButton("more", "ellipsis", "Import und Export")}${navButton("add", "plus", "Position hinzufügen")}` })}
    <div class="page">
      ${rows.length ? `
        <div class="grid cols-3 mb-24">
          <div class="card metric"><span class="label">Positionen</span><span class="value">${rows.length}</span></div>
          <div class="card metric"><span class="label">Stück gesamt</span><span class="value">${num(pieces)}</span></div>
          <div class="card metric"><span class="label">Budgetpreise</span><span class="value">${eur(total)}</span></div>
        </div>
        ${selecting ? `<div class="card row mb-16 spread"><span class="t-subhead">Wähle die Positionen für die Ausschreibung.</span>
          <button class="btn btn-filled small" data-action="make-tender" disabled>Ausschreibung erstellen</button></div>`
          : `<div class="row mb-16"><button class="btn btn-tinted small" data-action="select">${icon("tender", "sm")}Ausschreibung aus Auswahl</button>
             <button class="btn btn-gray small" data-action="import">${icon("upload", "sm")}Importieren</button></div>`}
        ${[...byRoom.entries()].map(([room, list]) => `
          <section class="group"><h2 class="group-header small">${esc(room)} · ${list.length}</h2>
          <ul class="list">${list.map((i) => `<li><${selecting ? "label" : "button"} class="cell" data-item="${i.id}">
            ${selecting ? `<input type="checkbox" class="sr-only" value="${i.id}"><span class="check" aria-hidden="true">${icon("check")}</span>` : ""}
            <span class="cell-text"><span class="cell-title">${esc(i.name)}</span>
              <span class="cell-sub">${[i.manufacturer, i.article_no, i.category, i.source !== "manuell" ? SOURCES[i.source] : ""].filter(Boolean).map(esc).join(" · ")}</span></span>
            <span class="cell-detail num"><span style="color:var(--label)">${num(i.quantity)} ${esc(i.unit)}</span>${i.unit_price_est != null ? `<br>${eur(i.quantity * i.unit_price_est)}` : ""}</span>
          </${selecting ? "label" : "button"}></li>`).join("")}</ul></section>`).join("")}`
      : empty({ icon: "list", title: "Stückliste ist leer",
          text: "Erfasse Möbel und Bauteile manuell oder übernimm sie aus SketchUp, AutoCAD (DXF/CSV) oder Excel.",
          action: `<div class="btn-row" style="justify-content:center"><button class="btn btn-filled" data-action="import">Datei importieren</button>
            <button class="btn btn-gray" data-action="add">Manuell erfassen</button></div><button class="btn btn-plain" data-action="help">Wie exportiere ich aus SketchUp/AutoCAD?</button>` })}
    </div>`;

  if (selecting) {
    const btn = ctx.root.querySelector('[data-action="make-tender"]');
    ctx.root.addEventListener("change", (e) => {
      if (e.target.type !== "checkbox") return;
      e.target.nextElementSibling.setAttribute("aria-checked", e.target.checked);
      const n = ctx.root.querySelectorAll('input[type="checkbox"]:checked').length;
      btn.disabled = n === 0;
      btn.textContent = n ? `Ausschreibung erstellen (${n})` : "Ausschreibung erstellen";
    });
  }

  ctx.root.addEventListener("click", async (e) => {
    try {
      const itemBtn = !selecting && e.target.closest("[data-item]");
      if (itemBtn) {
        if (await itemSheet({ projectId: id, item: rows.find((r) => r.id === itemBtn.dataset.item), rooms: [...byRoom.keys()] })) ctx.rerender();
        return;
      }
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action;
      if (act === "add" && await itemSheet({ projectId: id, rooms: [...byRoom.keys()] })) ctx.rerender();
      if (act === "import") importFlow(id, ctx.rerender);
      if (act === "help") helpSheet();
      if (act === "select") location.hash = `#/projekte/${id}/stueckliste?auswahl=1`;
      if (act === "cancel-select") location.hash = `#/projekte/${id}/stueckliste`;
      if (act === "more") {
        const c = await actionSheet({ actions: [
          { label: "Datei importieren (CSV, DXF)", value: "import" },
          { label: "Als CSV exportieren (Excel)", value: "export" },
          { label: "Aus CAD übernehmen – Hilfe", value: "help" },
        ] });
        if (c === "import") importFlow(id, ctx.rerender);
        if (c === "export") downloadFile(`Stueckliste-${p.name.replace(/[^\w-]+/g, "_")}.csv`, itemsToCSV(rows));
        if (c === "help") helpSheet();
      }
      if (act === "make-tender") {
        const ids = [...ctx.root.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value);
        const { tenderSheet } = await import("./tenders.js");
        const t = await tenderSheet({ projectId: id, itemIds: ids });
        if (t) location.hash = `#/projekte/${id}/ausschreibungen/${t.id}`;
      }
    } catch (err) { errorToast(err); }
  });
}
