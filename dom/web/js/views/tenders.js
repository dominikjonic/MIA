// Ausschreibungen: Positionen, Bieter (Anfrage per E-Mail), Angebote, Preisspiegel und Vergabe.
import { api, db, q, uploadFile } from "../supa.js";
import { icon } from "../icons.js";
import {
  actionSheet, confirmDialog, empty, errorToast, esc, eur, fmtDate, formSheet, header, isoDate, navButton, num, parseNumber, segmented, toast,
} from "../ui.js";
import { draftWithAI, mailSheet } from "./mail.js";

const STATUS = { entwurf: ["Entwurf", ""], versendet: ["Angefragt", "accent"], vergeben: ["Vergeben", "positive"] };

export async function tenderSheet({ projectId, itemIds = [], tender = null }) {
  const cats = await q(db.from("budget_categories").select("id, name").eq("project_id", projectId).order("position"));
  return formSheet({
    title: tender ? "Ausschreibung" : "Neue Ausschreibung",
    confirm: tender ? "Sichern" : "Erstellen",
    values: tender ?? { deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), category_id: cats.find((c) => /möbel/i.test(c.name))?.id },
    sections: [
      { fields: [
        { name: "title", label: "Titel", required: true, placeholder: "z. B. Büromöbel Arbeitsplätze" },
        { name: "category_id", label: "Budget", type: "select", options: [["", "Keine Kategorie"], ...cats.map((c) => [c.id, c.name])] },
        { name: "deadline", label: "Angebotsfrist", type: "date" },
      ], footer: itemIds.length ? `${itemIds.length} Positionen aus der Stückliste werden übernommen.` : "" },
      { fields: [{ name: "description", label: "Leistungsbeschreibung", type: "textarea", rows: 5, placeholder: "Lieferung und Montage inkl. Verpackungsentsorgung, Liefertermin KW …" }] },
    ],
    destructive: tender ? { label: "Ausschreibung löschen", confirmTitle: "Ausschreibung löschen?", message: "Alle Angebote dazu werden ebenfalls gelöscht.",
      onConfirm: async () => { await q(db.from("tenders").delete().eq("id", tender.id)); location.hash = `#/projekte/${projectId}/ausschreibungen`; } } : null,
    onSubmit: async (v) => {
      const row = { project_id: projectId, title: v.title, category_id: v.category_id || null, deadline: v.deadline, description: v.description };
      if (tender) return q(db.from("tenders").update(row).eq("id", tender.id).select().single());
      const t = await q(db.from("tenders").insert(row).select().single());
      if (itemIds.length) {
        const items = await q(db.from("items").select("*").in("id", itemIds).order("room").order("position"));
        await q(db.from("tender_positions").insert(items.map((i, n) => ({
          tender_id: t.id, item_id: i.id, quantity: i.quantity, unit: i.unit, position: n,
          title: [i.name, i.manufacturer, i.article_no ? `Art.-Nr. ${i.article_no}` : "", i.room ? `(${i.room})` : ""].filter(Boolean).join(" · "),
        }))));
      }
      return t;
    },
  });
}

// ---------------------------------------------------------------- Liste

async function list(ctx) {
  const id = ctx.params[0];
  const [p, tenders, offers] = await Promise.all([
    q(db.from("projects").select("id, name").eq("id", id).single()),
    q(db.from("tenders").select("*, budget_categories(name)").eq("project_id", id).order("created_at")),
    q(db.from("v_offer_totals").select("tender_id, total, status")),
  ]);
  ctx.root.innerHTML = `
    ${header({ title: "Ausschreibungen", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name }, actions: navButton("add", "plus", "Neue Ausschreibung") })}
    <div class="page">
      ${tenders.length ? `<ul class="list">${tenders.map((t) => {
        const os = offers.filter((o) => o.tender_id === t.id);
        const best = os.length ? Math.min(...os.map((o) => Number(o.total))) : null;
        const [label, tone] = STATUS[t.status];
        return `<li><a class="cell" href="#/projekte/${id}/ausschreibungen/${t.id}">
          <span class="cell-text"><span class="cell-title t-headline">${esc(t.title)}</span>
          <span class="cell-sub">${os.length} Angebote${best != null ? ` · ab ${eur(best)}` : ""}${t.deadline ? ` · Frist ${fmtDate(t.deadline)}` : ""}${t.budget_categories ? ` · ${esc(t.budget_categories.name)}` : ""}</span></span>
          <span class="pill ${tone}">${label}</span><span class="chevron">${icon("chevronRight")}</span></a></li>`;
      }).join("")}</ul>`
      : empty({ icon: "tender", title: "Noch keine Ausschreibungen",
          text: "Wähle Positionen in der Stückliste aus und erstelle daraus eine Ausschreibung – oder lege sie hier direkt an.",
          action: `<div class="btn-row" style="justify-content:center"><a class="btn btn-filled" href="#/projekte/${id}/stueckliste?auswahl=1">Aus Stückliste erstellen</a><button class="btn btn-gray" data-action="add">Leer anlegen</button></div>` })}
    </div>`;
  ctx.root.addEventListener("click", async (e) => {
    if (!e.target.closest('[data-action="add"]')) return;
    try {
      const t = await tenderSheet({ projectId: id });
      if (t) location.hash = `#/projekte/${id}/ausschreibungen/${t.id}`;
    } catch (err) { errorToast(err); }
  });
}

// ---------------------------------------------------------------- Detail

function positionSheet(tenderId, pos = null) {
  return formSheet({
    title: pos ? "Position" : "Neue Position",
    confirm: pos ? "Sichern" : "Hinzufügen",
    values: pos ?? { quantity: 1, unit: "Stk" },
    sections: [{ fields: [
      { name: "title", label: "Leistung", type: "textarea", rows: 2, required: true },
      { name: "quantity", label: "Menge", type: "number", required: true },
      { name: "unit", label: "Einheit" },
    ] }],
    destructive: pos ? { label: "Position löschen", confirmTitle: "Position löschen?", onConfirm: () => q(db.from("tender_positions").delete().eq("id", pos.id)) } : null,
    onSubmit: (v) => pos
      ? q(db.from("tender_positions").update(v).eq("id", pos.id))
      : q(db.from("tender_positions").insert({ ...v, tender_id: tenderId, position: 999 })),
  });
}

async function offerSheet({ tender, positions, contacts, offer = null, prices = [], prefill = null }) {
  const priceOf = (pid) => prices.find((x) => x.position_id === pid)?.unit_price;
  return formSheet({
    title: offer ? "Angebot" : "Angebot erfassen",
    confirm: offer ? "Sichern" : "Hinzufügen",
    wide: true,
    values: offer ?? prefill ?? { received_date: isoDate(), discount_pct: 0, extra_costs: 0 },
    sections: [
      { fields: [
        { name: "contact_id", label: "Bieter", type: "select", required: true, options: [["", "Bitte wählen"], ...contacts.map((c) => [c.id, c.company ?? c.name])] },
        { name: "received_date", label: "Eingegangen", type: "date" },
        { name: "valid_until", label: "Gültig bis", type: "date" },
        { name: "delivery_weeks", label: "Lieferzeit", type: "number", suffix: "Wochen" },
      ], footer: "Bieter fehlt? Lege ihn zuerst unter Kontakte an oder füge ihn im Reiter „Bieter“ hinzu." },
      { header: "Einzelpreise netto", html: `<div class="table-wrap"><table class="data"><thead><tr><th>Position</th><th class="r">Menge</th><th class="r">EP €</th></tr></thead><tbody>
        ${positions.map((p) => `<tr><td>${esc(p.title)}</td><td class="r">${num(p.quantity)} ${esc(p.unit)}</td>
          <td class="r"><input inputmode="decimal" data-price="${p.id}" value="${priceOf(p.id) != null ? String(priceOf(p.id)).replace(".", ",") : ""}" aria-label="Einzelpreis ${esc(p.title)}"></td></tr>`).join("")}
        </tbody></table></div>`, footer: "Leere Felder gelten als „nicht angeboten“ und werden im Preisspiegel markiert." },
      { fields: [
        { name: "discount_pct", label: "Rabatt", type: "number", suffix: "%" },
        { name: "extra_costs", label: "Fracht & Montage", type: "money", suffix: "€" },
        { name: "notes", label: "Notizen", type: "textarea", rows: 2, placeholder: "z. B. Montage inkl., Zahlungsziel 30 Tage" },
      ] },
    ],
    destructive: offer ? { label: "Angebot löschen", confirmTitle: "Angebot löschen?", onConfirm: () => q(db.from("offers").delete().eq("id", offer.id)) } : null,
    onSubmit: async (v) => {
      const sheet = document.querySelector("dialog.sheet:last-of-type");
      const priceRows = [...sheet.querySelectorAll("[data-price]")].map((inp) => ({ position_id: inp.dataset.price, unit_price: parseNumber(inp.value) }));
      if (priceRows.some((r) => Number.isNaN(r.unit_price))) throw new Error("Bitte nur Zahlen bei den Einzelpreisen eintragen.");
      const row = {
        tender_id: tender.id, contact_id: v.contact_id, received_date: v.received_date ?? isoDate(), valid_until: v.valid_until,
        delivery_weeks: v.delivery_weeks, discount_pct: v.discount_pct ?? 0, extra_costs: v.extra_costs ?? 0, notes: v.notes,
      };
      const saved = offer ? await q(db.from("offers").update(row).eq("id", offer.id).select().single()) : await q(db.from("offers").insert(row).select().single());
      await q(db.from("offer_prices").delete().eq("offer_id", saved.id));
      const filled = priceRows.filter((r) => r.unit_price != null).map((r) => ({ ...r, offer_id: saved.id }));
      if (filled.length) await q(db.from("offer_prices").insert(filled));
      if (tender.status === "entwurf") await q(db.from("tenders").update({ status: "versendet" }).eq("id", tender.id));
      return saved;
    },
  });
}

async function bidderSheet(tenderId, existing) {
  const contacts = await q(db.from("contacts").select("id, company, name, trade, kind").in("kind", ["lieferant", "handwerker", "spedition"]).order("company"));
  const available = contacts.filter((c) => !existing.includes(c.id));
  return formSheet({
    title: "Bieter hinzufügen",
    confirm: "Hinzufügen",
    sections: [
      ...(available.length ? [{ header: "Aus Kontakten", fields: [{ name: "contact_id", label: "Kontakt", type: "select", options: [["", "Bitte wählen"], ...available.map((c) => [c.id, `${c.company ?? c.name}${c.trade ? ` – ${c.trade}` : ""}`])] }] }] : []),
      { header: "Oder neu anlegen", fields: [
        { name: "company", label: "Firma" },
        { name: "email", label: "E-Mail", type: "email" },
        { name: "trade", label: "Gewerk", placeholder: "z. B. Tischler, Trockenbau, Büromöbel" },
        { name: "kind", label: "Art", type: "select", options: [["lieferant", "Lieferant"], ["handwerker", "Handwerker"], ["spedition", "Spedition"]] },
      ] },
    ],
    onSubmit: async (v) => {
      let contactId = v.contact_id;
      if (!contactId) {
        if (!v.company) throw new Error("Wähle einen Kontakt oder gib eine Firma ein.");
        contactId = (await q(db.from("contacts").insert({ company: v.company, email: v.email, trade: v.trade, kind: v.kind }).select("id").single())).id;
      }
      return q(db.from("tender_bidders").insert({ tender_id: tenderId, contact_id: contactId }));
    },
  });
}

async function detail(ctx) {
  const [projectId, tenderId] = ctx.params;
  const tab = ctx.query.get("ansicht") ?? "spiegel";
  const [p, t, positions, bidders, offers, totals, prices, profile] = await Promise.all([
    q(db.from("projects").select("id, name, address, move_date").eq("id", projectId).single()),
    q(db.from("tenders").select("*, budget_categories(name, planned)").eq("id", tenderId).single()),
    q(db.from("tender_positions").select("*").eq("tender_id", tenderId).order("position").order("title")),
    q(db.from("tender_bidders").select("*, contacts(id, company, name, email, trade)").eq("tender_id", tenderId)),
    q(db.from("offers").select("*").eq("tender_id", tenderId)),
    q(db.from("v_offer_totals").select("*").eq("tender_id", tenderId).order("total")),
    q(db.from("offer_prices").select("*, offers!inner(tender_id)").eq("offers.tender_id", tenderId)),
    q(db.from("profiles").select("user_name, company_name").maybeSingle()),
  ]);
  const allContacts = await q(db.from("contacts").select("id, company, name, email").order("company"));
  const bidderContacts = bidders.map((b) => b.contacts);
  const offerContacts = allContacts.filter((c) => bidderContacts.some((b) => b.id === c.id) || offers.some((o) => o.contact_id === c.id));
  const planned = t.budget_categories?.planned != null ? Number(t.budget_categories.planned) : null;
  const [statusLabel, statusTone] = STATUS[t.status];
  const base = `#/projekte/${projectId}/ausschreibungen/${tenderId}`;

  // Preisspiegel-Daten
  const price = (offerId, posId) => prices.find((x) => x.offer_id === offerId && x.position_id === posId)?.unit_price;
  const bestPerPos = Object.fromEntries(positions.map((pos) => {
    const vals = totals.map((o) => price(o.offer_id, pos.id)).filter((v) => v != null).map(Number);
    return [pos.id, vals.length ? Math.min(...vals) : null];
  }));
  const complete = totals.filter((o) => o.priced_positions >= o.all_positions);
  const recommended = (complete.length ? complete : totals)[0];
  const second = (complete.length ? complete : totals)[1];
  const bestPositionsSum = positions.reduce((s, pos) => s + (bestPerPos[pos.id] ?? 0) * Number(pos.quantity), 0);

  const recommendation = recommended ? [
    `<b>${esc(recommended.bidder)}</b> ist mit ${eur(recommended.total)} das günstigste${complete.length ? " vollständige" : ""} Angebot`,
    second ? `, ${eur(Number(second.total) - Number(recommended.total))} unter ${esc(second.bidder)}` : "",
    ". ",
    planned != null ? (Number(recommended.total) <= planned ? `Liegt ${eur(planned - Number(recommended.total))} unter dem Budget (${eur(planned)}).` : `<span class="critical">Liegt ${eur(Number(recommended.total) - planned)} über dem Budget (${eur(planned)}).</span>`) : "",
    totals.length > 1 && bestPositionsSum < Number(recommended.net_positions) * 0.97 ? ` Die Bestpreise je Position ergäben ${eur(bestPositionsSum)} – Nachverhandeln lohnt sich.` : "",
  ].join("") : "";

  const spiegel = !positions.length ? empty({ icon: "list", title: "Keine Positionen", text: "Füge Positionen hinzu oder erstelle die Ausschreibung aus der Stückliste." })
    : !totals.length ? empty({ icon: "compare", title: "Noch keine Angebote", text: "Erfasse eingegangene Angebote – DOM erstellt den Preisspiegel automatisch.", action: '<div class="btn-row" style="justify-content:center"><button class="btn btn-filled" data-action="read-offer">Angebot aus PDF einlesen</button><button class="btn btn-gray" data-action="add-offer">Manuell erfassen</button></div>' })
    : `
      <div class="card mb-16 t-subhead">${icon("sparkle", "sm")} ${recommendation}</div>
      <div class="table-wrap mb-16"><table class="data">
        <thead><tr><th>Position</th><th class="r">Menge</th>${totals.map((o) => { const src = offers.find((x) => x.id === o.offer_id); return `<th class="r">${esc(o.bidder)}${o.status === "vergeben" ? " ✓" : ""}${src?.source === "gmail" ? `<br><span class="pill accent small">${icon("mail", "sm")}aus Gmail</span>` : ""}</th>`; }).join("")}</tr></thead>
        <tbody>${positions.map((pos) => `<tr><td>${esc(pos.title)}</td><td class="r">${num(pos.quantity)} ${esc(pos.unit)}</td>
          ${totals.map((o) => { const ep = price(o.offer_id, pos.id); return ep == null ? `<td class="r critical">fehlt</td>`
            : `<td class="r ${Number(ep) === bestPerPos[pos.id] && totals.length > 1 ? "best" : ""}">${eur(Number(ep) * Number(pos.quantity))}<br><span class="t-caption secondary">EP ${eur(ep, true)}</span></td>`; }).join("")}</tr>`).join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="2">Summe Positionen</td>${totals.map((o) => `<td class="r">${eur(o.net_positions)}</td>`).join("")}</tr>
          <tr><td colspan="2">Rabatt</td>${totals.map((o) => `<td class="r">${Number(o.discount_pct) ? `−${num(o.discount_pct)} %` : "–"}</td>`).join("")}</tr>
          <tr><td colspan="2">Fracht & Montage</td>${totals.map((o) => `<td class="r">${eur(o.extra_costs)}</td>`).join("")}</tr>
          <tr><td colspan="2"><b>Gesamt netto</b></td>${totals.map((o) => `<td class="r ${o.offer_id === recommended?.offer_id ? "best" : ""}"><b>${eur(o.total)}</b></td>`).join("")}</tr>
          ${planned != null ? `<tr><td colspan="2">Budget ${eur(planned)}</td>${totals.map((o) => { const d = Number(o.total) - planned; return `<td class="r ${d > 0 ? "critical" : "positive"}">${d > 0 ? "+" : "−"}${eur(Math.abs(d))}</td>`; }).join("")}</tr>` : ""}
          <tr><td colspan="2">Lieferzeit</td>${totals.map((o) => `<td class="r">${o.delivery_weeks ? `${num(o.delivery_weeks)} Wo.` : "–"}</td>`).join("")}</tr>
          <tr><td colspan="2">Vollständig</td>${totals.map((o) => `<td class="r ${o.priced_positions < o.all_positions ? "critical" : ""}">${o.priced_positions}/${o.all_positions}</td>`).join("")}</tr>
          <tr><td colspan="2"></td>${totals.map((o) => `<td class="r"><button class="btn btn-plain small" data-offer="${o.offer_id}">Bearbeiten</button>
            ${t.status !== "vergeben" ? `<br><button class="btn btn-tinted small" data-award="${o.offer_id}">Vergeben</button>` : o.status === "vergeben" ? '<br><span class="pill positive">Vergeben</span>' : ""}</td>`).join("")}</tr>
        </tfoot></table></div>
      <div class="row no-print"><button class="btn btn-tinted small" data-action="read-offer">${icon("sparkle", "sm")}Angebot aus PDF einlesen</button><button class="btn btn-gray small" data-action="add-offer">${icon("plus", "sm")}Angebot erfassen</button><button class="btn btn-gray small" data-action="print">${icon("print", "sm")}Preisspiegel drucken</button></div>`;

  const posTab = `
    <section class="group"><ul class="list">${positions.map((pos, i) => `<li><button class="cell" data-pos="${pos.id}">
      <span class="t-footnote secondary num" style="width:22px">${i + 1}</span>
      <span class="cell-text"><span class="cell-title">${esc(pos.title)}</span></span>
      <span class="cell-detail num">${num(pos.quantity)} ${esc(pos.unit)}</span></button></li>`).join("")}
      <li><button class="cell btn-plain" data-action="add-pos">${icon("plus", "sm")} Position hinzufügen</button></li></ul>
    ${t.description ? `<p class="group-footer">${esc(t.description)}</p>` : ""}</section>`;

  const bidTab = `
    <section class="group"><ul class="list">${bidders.map((b) => {
      const hasOffer = offers.some((o) => o.contact_id === b.contact_id);
      return `<li><div class="cell">
        <span class="cell-text"><span class="cell-title">${esc(b.contacts.company ?? b.contacts.name)}</span>
        <span class="cell-sub">${esc(b.contacts.email ?? "keine E-Mail")}${b.contacts.trade ? ` · ${esc(b.contacts.trade)}` : ""}</span></span>
        ${hasOffer ? '<span class="pill positive">Angebot da</span>' : b.followup_at ? `<span class="pill warning">Erinnert ${fmtDate(b.followup_at, { day: "numeric", month: "short" })}</span>` : b.invited_at ? `<span class="pill accent">Angefragt ${fmtDate(b.invited_at, { day: "numeric", month: "short" })}</span>` : ""}
        <button class="btn btn-tinted small" data-invite="${b.contact_id}">${icon("mail", "sm")}Anfrage</button>
      </div></li>`;
    }).join("")}<li><button class="cell btn-plain" data-action="add-bidder">${icon("plus", "sm")} Bieter hinzufügen</button></li></ul>
    <p class="group-footer">„Anfrage“ lässt den Assistenten eine Angebotsanfrage mit allen Positionen formulieren. Du prüfst den Text und speicherst ihn als Gmail-Entwurf. Sobald die Ausschreibung versendet ist, übernimmt DOM Angebote (PDF) dieser Bieter automatisch aus Gmail und legt einen Tag vor der Frist Erinnerungen an alle an, die noch nicht angeboten haben.</p></section>`;

  ctx.root.innerHTML = `
    ${header({ title: t.title, subtitle: `${esc(p.name)} · <span class="pill ${statusTone}">${statusLabel}</span>${t.deadline ? ` · Frist ${fmtDate(t.deadline)}` : ""}`,
      back: { href: `#/projekte/${projectId}/ausschreibungen`, label: "Ausschreibungen" }, actions: navButton("edit", "pencil", "Ausschreibung bearbeiten") })}
    <div class="page">
      ${segmented("ansicht", [["spiegel", "Preisspiegel"], ["positionen", `Positionen (${positions.length})`], ["bieter", `Bieter (${bidders.length})`]], tab)}
      ${tab === "positionen" ? posTab : tab === "bieter" ? bidTab : spiegel}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-seg] button");
    if (seg) { location.hash = `${base}?ansicht=${seg.dataset.value}`; return; }
    try {
      const posBtn = e.target.closest("[data-pos]");
      if (posBtn && await positionSheet(tenderId, positions.find((x) => x.id === posBtn.dataset.pos))) return ctx.rerender();

      const offerBtn = e.target.closest("[data-offer]");
      if (offerBtn) {
        const offer = offers.find((o) => o.id === offerBtn.dataset.offer);
        if (await offerSheet({ tender: t, positions, contacts: offerContacts.length ? offerContacts : allContacts, offer, prices: prices.filter((x) => x.offer_id === offer.id) })) ctx.rerender();
        return;
      }

      const awardBtn = e.target.closest("[data-award]");
      if (awardBtn) {
        const o = totals.find((x) => x.offer_id === awardBtn.dataset.award);
        const ok = await confirmDialog({
          title: `Auftrag an ${o.bidder} vergeben?`,
          message: `${eur(o.total)} werden als Beauftragung${t.budget_categories ? ` in „${t.budget_categories.name}“` : ""} gebucht. Die anderen Angebote werden als abgelehnt markiert.`,
          confirm: "Vergeben",
        });
        if (!ok) return;
        await q(db.from("offers").update({ status: "abgelehnt" }).eq("tender_id", tenderId).neq("id", o.offer_id));
        await q(db.from("offers").update({ status: "vergeben" }).eq("id", o.offer_id));
        await q(db.from("tenders").update({ status: "vergeben", awarded_offer_id: o.offer_id }).eq("id", tenderId));
        await q(db.from("costs").delete().eq("offer_id", o.offer_id));
        await q(db.from("costs").insert({ project_id: projectId, category_id: t.category_id, kind: "beauftragt", title: `Auftrag ${t.title} – ${o.bidder}`, amount: o.total, contact_id: o.contact_id, offer_id: o.offer_id }));
        toast(`Vergeben an ${o.bidder} – im Budget gebucht`);
        const next = await actionSheet({ title: "Wie geht es weiter?", actions: [
          { label: `Auftragsbestätigung an ${o.bidder} entwerfen`, value: "order" },
          ...(totals.length > 1 ? [{ label: "Absagen an die anderen Bieter entwerfen", value: "reject" }] : []),
        ] });
        if (next === "order") await composeMail("order", o.contact_id, { t, p, positions, profile, offer: o });
        if (next === "reject") for (const other of totals.filter((x) => x.offer_id !== o.offer_id)) await composeMail("reject", other.contact_id, { t, p, positions, profile, offer: other });
        return ctx.rerender();
      }

      const invite = e.target.closest("[data-invite]");
      if (invite) {
        await composeMail("invite", invite.dataset.invite, { t, p, positions, profile });
        await q(db.from("tender_bidders").update({ invited_at: new Date().toISOString() }).eq("tender_id", tenderId).eq("contact_id", invite.dataset.invite));
        if (t.status === "entwurf") await q(db.from("tenders").update({ status: "versendet" }).eq("id", tenderId));
        return ctx.rerender();
      }

      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action;
      if (act === "edit" && await tenderSheet({ projectId, tender: t })) ctx.rerender();
      if (act === "add-pos" && await positionSheet(tenderId)) ctx.rerender();
      if (act === "add-bidder" && await bidderSheet(tenderId, bidders.map((b) => b.contact_id))) ctx.rerender();
      if (act === "add-offer" && await offerSheet({ tender: t, positions, contacts: offerContacts.length ? offerContacts : allContacts })) ctx.rerender();
      if (act === "read-offer") readOfferFromFile();
      if (act === "print") window.print();
    } catch (err) { errorToast(err); }
  });

  /** Angebot (PDF/Foto) hochladen → KI ordnet Preise den Positionen zu → vorausgefülltes Formular zum Prüfen. */
  function readOfferFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,image/*";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        toast("Angebot wird gelesen – das dauert etwa 20 Sekunden …", { duration: 20000 });
        const stored = await uploadFile(file, { projectId, kind: "angebot", caption: `Angebot ${t.title}` });
        const r = await api("/extract", { kind: "offer", file_id: stored.id, tender_id: tenderId });
        let contact = allContacts.find((c) => (c.company ?? "").toLowerCase() === r.bidder_company.toLowerCase())
          ?? allContacts.find((c) => c.company && r.bidder_company.toLowerCase().includes(c.company.toLowerCase().split(" ")[0]));
        if (!contact) {
          contact = await q(db.from("contacts").insert({ kind: "lieferant", company: r.bidder_company, email: r.bidder_email }).select("id, company, name, email").single());
          allContacts.push(contact);
        }
        if (!bidders.some((b) => b.contact_id === contact.id)) await q(db.from("tender_bidders").insert({ tender_id: tenderId, contact_id: contact.id }));
        toast(`${r.prices.length} von ${positions.length} Positionen erkannt – bitte prüfen`, { duration: 6000 });
        const saved = await offerSheet({
          tender: t, positions, contacts: allContacts, prices: r.prices,
          prefill: { contact_id: contact.id, received_date: isoDate(), valid_until: r.valid_until, delivery_weeks: r.delivery_weeks, discount_pct: r.discount_pct, extra_costs: r.extra_costs, notes: r.notes },
        });
        ctx.rerender();
        if (saved) toast("Angebot übernommen – Preisspiegel aktualisiert");
      } catch (err) { errorToast(err); }
    };
    input.click();
  }

  async function composeMail(kind, contactId, data) {
    const c = allContacts.find((x) => x.id === contactId) ?? bidderContacts.find((x) => x.id === contactId);
    const posText = data.positions.map((pos, i) => `${i + 1}. ${pos.title} – ${num(pos.quantity)} ${pos.unit}`).join("\n");
    const who = `${data.profile?.user_name ?? ""}${data.profile?.company_name ? `, ${data.profile.company_name}` : ""}`;
    const instructions = {
      invite: `Schreibe eine Angebotsanfrage an ${c.company ?? c.name} für das Projekt „${data.p.name}“${data.p.address ? ` (${data.p.address})` : ""} zur Ausschreibung „${data.t.title}“.
Angebotsfrist: ${data.t.deadline ? fmtDate(data.t.deadline, { day: "numeric", month: "long", year: "numeric" }) : "in zwei Wochen"}. ${data.p.move_date ? `Gewünschte Fertigstellung vor dem Umzug am ${fmtDate(data.p.move_date, { day: "numeric", month: "long" })}.` : ""}
Leistungsbeschreibung: ${data.t.description ?? "Lieferung und Montage"}.
Positionen (bitte Einzelpreise netto, Lieferzeit, Fracht/Montage und Gültigkeit angeben):\n${posText}\nAbsender: ${who}.`,
      reject: `Schreibe eine freundliche, kurze Absage an ${c.company ?? c.name} zur Ausschreibung „${data.t.title}“ (Projekt „${data.p.name}“). Bedanke dich für das Angebot über ${eur(data.offer.total)} und die Mühe, ohne Details zum Wettbewerb. Absender: ${who}.`,
      order: `Schreibe eine Auftragsbestätigung an ${c.company ?? c.name}: Wir beauftragen das Angebot vom ${fmtDate(new Date())} zur Ausschreibung „${data.t.title}“ (Projekt „${data.p.name}“${data.p.address ? `, ${data.p.address}` : ""}) über ${eur(data.offer.total)} netto. Bitte um Bestätigung des Liefer- und Montagetermins${data.p.move_date ? ` vor dem ${fmtDate(data.p.move_date, { day: "numeric", month: "long" })}` : ""}. Positionen:\n${posText}\nAbsender: ${who}.`,
    };
    toast("Der Assistent formuliert die E-Mail …", { duration: 3000 });
    const mail = await draftWithAI(instructions[kind]);
    await mailSheet({ to: c.email ?? "", subject: mail.subject, body: mail.body, title: { invite: "Angebotsanfrage", reject: "Absage", order: "Auftragsbestätigung" }[kind] });
  }
}

export default function (ctx) {
  return ctx.mode === "detail" ? detail(ctx) : list(ctx);
}
