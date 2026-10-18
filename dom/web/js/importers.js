// Import von Stücklisten: CSV (SketchUp-Bericht, AutoCAD-Datenextraktion, Excel) und DXF (Blöcke zählen).

export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = [";", "\t", ","].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const COLUMNS = {
  name: ["bezeichnung", "name", "definition name", "definitionsname", "definition", "komponente", "component", "block name", "blockname", "artikel", "beschreibung", "description", "object", "objekt", "produkt"],
  quantity: ["menge", "anzahl", "quantity", "count", "qty", "stück", "stk", "anz"],
  unit: ["einheit", "unit", "me"],
  room: ["raum", "room", "zone", "bereich", "layer", "ebene", "tag", "etikett"],
  category: ["kategorie", "category", "gruppe", "group", "typ", "type", "warengruppe"],
  manufacturer: ["hersteller", "manufacturer", "marke", "brand", "lieferant"],
  article_no: ["artikelnummer", "artikel-nr", "art.-nr", "art-nr", "artnr", "sku", "article", "part number", "bestellnummer"],
  unit_price_est: ["preis", "price", "einzelpreis", "ep", "unit price", "stückpreis", "budgetpreis"],
};

function matchColumn(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g, " ");
  for (const [key, names] of Object.entries(COLUMNS)) if (names.includes(h)) return key;
  for (const [key, names] of Object.entries(COLUMNS)) if (names.some((n) => n.length > 3 && h.includes(n))) return key;
  return null;
}

function toNumber(s) {
  if (s == null || s === "") return null;
  const t = String(s).replace(/[^\d,.\-]/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** CSV → Positionen. Ohne Mengenspalte werden gleiche Zeilen gezählt (z. B. SketchUp „Komponenten“-Bericht). */
export function itemsFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("Die Datei enthält keine Datenzeilen.");
  const mapping = rows[0].map(matchColumn);
  if (!mapping.includes("name")) throw new Error(`Keine Spalte für die Bezeichnung gefunden. Erkannte Spalten: ${rows[0].join(", ")}`);
  const hasQty = mapping.includes("quantity");
  const grouped = new Map();
  for (const r of rows.slice(1)) {
    const item = {};
    mapping.forEach((key, i) => { if (key && r[i] != null && r[i].trim() !== "") item[key] = r[i].trim(); });
    if (!item.name) continue;
    const qty = hasQty ? toNumber(item.quantity) ?? 1 : 1;
    const k = [item.name, item.room ?? "", item.article_no ?? ""].join("|");
    const prev = grouped.get(k);
    if (prev) prev.quantity += qty;
    else grouped.set(k, { ...item, quantity: qty, unit_price_est: toNumber(item.unit_price_est) });
  }
  return { items: [...grouped.values()], columns: rows[0].map((h, i) => `${h} → ${mapping[i] ?? "–"}`) };
}

/** DXF (ASCII) → Blockreferenzen (INSERT) gezählt nach Blockname und Layer. */
export function itemsFromDXF(text) {
  const lines = text.split(/\r?\n/);
  const counts = new Map();
  let inEntities = false;
  let current = null;
  const flush = () => {
    if (current && current.name && !current.name.startsWith("*")) {
      const k = `${current.name}|${current.layer ?? ""}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    current = null;
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === "2" && value === "ENTITIES" && !current) { inEntities = true; continue; }
    if (code === "0" && value === "ENDSEC") { flush(); inEntities = false; continue; }
    if (!inEntities) continue;
    if (code === "0") { flush(); if (value === "INSERT") current = {}; continue; }
    if (current && code === "2") current.name = value;
    if (current && code === "8") current.layer = value;
  }
  flush();
  if (!counts.size) throw new Error("Keine Blockreferenzen gefunden. Exportiere die Zeichnung als ASCII-DXF mit Möbeln als Blöcke.");
  return {
    items: [...counts.entries()].map(([k, n]) => {
      const [name, layer] = k.split("|");
      return { name, room: layer && layer !== "0" ? layer : null, quantity: n, category: "Möbel" };
    }).sort((a, b) => b.quantity - a.quantity),
    columns: ["Blockname → Bezeichnung", "Layer → Raum", "Anzahl → Menge"],
  };
}

export function itemsToCSV(items) {
  const head = ["Raum", "Kategorie", "Bezeichnung", "Hersteller", "Artikelnummer", "Menge", "Einheit", "Budgetpreis", "Summe", "Notizen"];
  const escCell = (v) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n) => (n == null ? "" : String(n).replace(".", ","));
  const lines = items.map((i) => [i.room, i.category, i.name, i.manufacturer, i.article_no, num(i.quantity), i.unit, num(i.unit_price_est),
    num(i.unit_price_est != null ? Math.round(i.quantity * i.unit_price_est * 100) / 100 : null), i.notes].map(escCell).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}
