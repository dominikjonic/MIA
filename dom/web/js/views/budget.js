// Budgetüberwachung: Plan, beauftragt, abgerechnet, Prognose je Kategorie, Kostenbuchungen.
import { api, db, q, uploadFile } from "../supa.js";
import { icon } from "../icons.js";
import { budgetPill, empty, errorToast, esc, eur, fmtDate, formSheet, header, isoDate, navButton, progress, segmented, toast } from "../ui.js";

function costSheet({ projectId, categories, cost = null, prefill = null }) {
  return formSheet({
    title: cost ? (cost.kind === "rechnung" ? "Rechnung" : "Beauftragung") : "Kosten erfassen",
    confirm: cost ? "Sichern" : "Hinzufügen",
    values: cost ?? prefill ?? { kind: "rechnung", cost_date: isoDate(), category_id: categories[0]?.category_id },
    sections: [
      { fields: [
        { name: "kind", label: "Art", type: "select", options: [["rechnung", "Rechnung"], ["beauftragt", "Beauftragung"]] },
        { name: "title", label: "Bezeichnung", required: true, placeholder: "z. B. Teilrechnung Tischlerei" },
        { name: "amount", label: "Betrag (netto)", type: "money", suffix: "€", required: true, placeholder: "0,00" },
        { name: "category_id", label: "Kategorie", type: "select", options: categories.map((c) => [c.category_id, c.name]) },
        { name: "cost_date", label: "Datum", type: "date" },
      ], footer: "Beauftragungen zählen als feste Zusage. Rechnungen zeigen, was bereits abgerechnet ist. Vergebene Angebote werden automatisch als Beauftragung gebucht." },
      { fields: [{ name: "notes", label: "Notizen", type: "textarea", rows: 2 }] },
    ],
    destructive: cost ? { label: "Buchung löschen", confirmTitle: "Buchung löschen?", onConfirm: () => q(db.from("costs").delete().eq("id", cost.id)) } : null,
    onSubmit: (v) => {
      const row = { project_id: projectId, kind: v.kind, title: v.title, amount: v.amount, category_id: v.category_id, cost_date: v.cost_date ?? isoDate(), notes: v.notes };
      return cost ? q(db.from("costs").update(row).eq("id", cost.id).select().single()) : q(db.from("costs").insert(row).select().single());
    },
  });
}

function categorySheet({ projectId, category = null }) {
  return formSheet({
    title: category ? "Kategorie" : "Neue Kategorie",
    confirm: category ? "Sichern" : "Hinzufügen",
    values: category ?? {},
    sections: [{ fields: [
      { name: "name", label: "Name", required: true, placeholder: "z. B. Küche" },
      { name: "planned", label: "Plan", type: "money", suffix: "€", placeholder: "0" },
    ] }],
    destructive: category ? {
      label: "Kategorie löschen", confirmTitle: `„${category.name}“ löschen?`, message: "Buchungen bleiben erhalten, aber ohne Kategorie.",
      onConfirm: () => q(db.from("budget_categories").delete().eq("id", category.category_id)),
    } : null,
    onSubmit: (v) => category
      ? q(db.from("budget_categories").update({ name: v.name, planned: v.planned ?? 0 }).eq("id", category.category_id))
      : q(db.from("budget_categories").insert({ project_id: projectId, name: v.name, planned: v.planned ?? 0, position: 99 })),
  });
}

export default async function budget(ctx) {
  const id = ctx.params[0];
  const tab = ctx.query.get("ansicht") ?? "kategorien";
  const [p, s, cats, costs, items] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("v_project_status").select("*").eq("project_id", id).single()),
    q(db.from("v_budget_categories").select("*").eq("project_id", id).order("position")),
    q(db.from("costs").select("*, contacts(company, name)").eq("project_id", id).order("cost_date", { ascending: false })),
    q(db.from("items").select("quantity, unit_price_est").eq("project_id", id)),
  ]);
  const bomEstimate = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price_est ?? 0), 0);
  const rest = Number(p.budget_total) - Number(s.forecast);
  const over = cats.filter((c) => Number(c.forecast) > Number(c.planned) && Number(c.planned) > 0);
  const maxVal = Math.max(1, ...cats.map((c) => Math.max(Number(c.planned), Number(c.forecast))));
  const pct = p.budget_total > 0 ? Math.round((s.forecast / p.budget_total) * 100) : 0;
  const tone = { im_budget: "positive", knapp: "warning", ueberschritten: "critical" }[s.budget_state] ?? "";

  const summary = p.budget_total <= 0
    ? "Noch kein Gesamtbudget hinterlegt – trage es im Projekt ein, dann überwacht DOM jede Kategorie."
    : over.length
      ? over.map((c) => `${c.name} liegt ${eur(Number(c.forecast) - Number(c.planned))} über Plan`).join(", ") + "."
      : rest >= 0 ? `Alle Kategorien im Plan. ${eur(rest)} Spielraum.` : `Gesamtprognose ${eur(-rest)} über Budget.`;

  ctx.root.innerHTML = `
    ${header({ title: "Budget", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name }, actions: `${navButton("read-invoice", "sparkle", "Rechnung einlesen")}${navButton("add-cost", "plus", "Kosten erfassen")}` })}
    <div class="page">
      <div class="card mb-24 stack">
        <div class="spread"><div><div class="t-subhead secondary">Prognose</div><div class="t-title1 num">${eur(s.forecast)}</div></div>${budgetPill(s.budget_state)}</div>
        ${progress(pct, tone)}
        <div class="t-subhead">${esc(summary)}</div>
        <div class="grid cols-4">
          <div><div class="t-footnote secondary">Budget</div><div class="t-headline num">${eur(p.budget_total)}</div></div>
          <div><div class="t-footnote secondary">Beauftragt</div><div class="t-headline num">${eur(s.committed)}</div></div>
          <div><div class="t-footnote secondary">Abgerechnet</div><div class="t-headline num">${eur(s.invoiced)}</div></div>
          <div><div class="t-footnote secondary">${rest >= 0 ? "Spielraum" : "Überschreitung"}</div><div class="t-headline num ${rest < 0 ? "critical" : ""}">${eur(Math.abs(rest))}</div></div>
        </div>
        ${bomEstimate > 0 ? `<div class="muted-box">${icon("list", "sm")} Stückliste (Budgetpreise): ${eur(bomEstimate)}</div>` : ""}
      </div>

      ${segmented("ansicht", [["kategorien", "Kategorien"], ["buchungen", "Buchungen"]], tab)}

      ${tab === "kategorien" ? `
        <section class="group">
          <div class="card">
            <div class="bars" role="list" aria-label="Budget je Kategorie">${cats.map((c) => {
              const f = Number(c.forecast), pl = Number(c.planned), com = Number(c.committed), inv = Number(c.invoiced);
              const isOver = pl > 0 && f > pl;
              return `<div class="bar-row" role="listitem" aria-label="${esc(c.name)}: Plan ${eur(pl)}, Prognose ${eur(f)}">
                <div class="bar-head"><span>${esc(c.name)}</span><span class="num ${isOver ? "critical" : "secondary"}">${eur(f)} / ${eur(pl)}${isOver ? " ⚠" : ""}</span></div>
                <div class="bar-track">
                  <div class="planned" style="width:${(pl / maxVal) * 100}%"></div>
                  <div class="fill ${isOver ? "over" : ""}" style="width:${(Math.max(com, inv) / maxVal) * 100}%"></div>
                  ${isOver ? "" : `<div class="fill invoiced" style="width:${(inv / maxVal) * 100}%"></div>`}
                  <div class="plan" style="left:calc(${(pl / maxVal) * 100}% - 1px)"></div>
                </div></div>`;
            }).join("")}</div>
            <div class="legend"><span><i style="background:var(--fill-secondary)"></i>Plan</span><span><i style="background:var(--accent)"></i>Beauftragt</span><span><i style="background:var(--positive)"></i>Abgerechnet</span><span><i style="background:var(--critical)"></i>Über Plan</span></div>
          </div>
        </section>
        <section class="group">
          <h2 class="group-header">Kategorien<button class="btn btn-plain" data-action="add-cat">Hinzufügen</button></h2>
          <ul class="list">${cats.map((c) => `<li><button class="cell" data-cat="${c.category_id}">
            <span class="cell-text"><span class="cell-title">${esc(c.name)}</span><span class="cell-sub">beauftragt ${eur(c.committed)} · abgerechnet ${eur(c.invoiced)}</span></span>
            <span class="cell-detail num">${eur(c.planned)}</span><span class="chevron">${icon("chevronRight")}</span></button></li>`).join("")}</ul>
          <p class="group-footer">Prognose = beauftragter Betrag, sobald vergeben wurde, sonst der Planwert – mindestens aber die bereits abgerechneten Kosten.</p>
        </section>` : `
        <section class="group">
          ${costs.length ? `<ul class="list">${costs.map((c) => `<li><button class="cell" data-cost="${c.id}">
            <span class="pill ${c.kind === "rechnung" ? "positive" : "accent"}">${c.kind === "rechnung" ? "Rechnung" : "Auftrag"}</span>
            <span class="cell-text"><span class="cell-title">${esc(c.title)}</span><span class="cell-sub">${fmtDate(c.cost_date)} · ${esc(cats.find((x) => x.category_id === c.category_id)?.name ?? "ohne Kategorie")}${c.contacts ? ` · ${esc(c.contacts.company ?? c.contacts.name)}` : ""}</span></span>
            <span class="cell-detail num t-headline" style="color:var(--label)">${eur(c.amount, true)}</span></button></li>`).join("")}</ul>`
          : empty({ icon: "euro", title: "Noch keine Buchungen", text: "Lies Rechnungen als PDF oder Foto ein, erfasse sie manuell – oder vergib ein Angebot, dann bucht DOM es automatisch.",
              action: '<button class="btn btn-filled" data-action="add-cost">Kosten erfassen</button>' })}
        </section>`}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-seg] button");
    if (seg) { location.hash = `#/projekte/${id}/budget?ansicht=${seg.dataset.value}`; return; }
    try {
      const catBtn = e.target.closest("[data-cat]");
      if (catBtn && await categorySheet({ projectId: id, category: cats.find((c) => c.category_id === catBtn.dataset.cat) })) return ctx.rerender();
      const costBtn = e.target.closest("[data-cost]");
      if (costBtn && await costSheet({ projectId: id, categories: cats, cost: costs.find((c) => c.id === costBtn.dataset.cost) })) return ctx.rerender();
      const a = e.target.closest("[data-action]");
      if (a?.dataset.action === "add-cost" && await costSheet({ projectId: id, categories: cats })) ctx.rerender();
      if (a?.dataset.action === "read-invoice") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf,image/*";
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            toast("Rechnung wird gelesen …", { duration: 15000 });
            const stored = await uploadFile(file, { projectId: id, kind: "dokument", caption: "Rechnung" });
            const r = await api("/extract", { kind: "invoice", file_id: stored.id, project_id: id });
            const saved = await costSheet({ projectId: id, categories: cats, prefill: {
              kind: "rechnung", title: `${r.title} – ${r.supplier}`, amount: r.amount_net, cost_date: r.date ?? isoDate(), category_id: r.category_id,
              notes: r.invoice_number ? `Rechnungsnr. ${r.invoice_number}` : null } });
            if (saved) { toast("Rechnung im Budget gebucht"); ctx.rerender(); }
          } catch (err) { errorToast(err); }
        };
        input.click();
      }
      if (a?.dataset.action === "add-cat" && await categorySheet({ projectId: id })) ctx.rerender();
    } catch (err) { errorToast(err); }
  });
}
