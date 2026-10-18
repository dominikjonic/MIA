// Mängelliste: Mangel mit Foto, Ort, zuständigem Handwerker und Frist. Druckbare Liste, Erinnerungsmails an Handwerker.
import { api, db, hydrateImages, q, uploadFile } from "../supa.js";
import { icon } from "../icons.js";
import {
  contentSheet, empty, errorToast, esc, fmtDate, fmtDateLong, formSheet, header, isoDate, navButton, relDay, segmented, toast,
} from "../ui.js";
import { draftWithAI, mailSheet } from "./mail.js";

const who = (c) => c?.company ?? c?.name ?? "";

async function defectSheet(projectId, defect = null) {
  const contacts = await q(db.from("contacts").select("id, company, name, kind").neq("kind", "kunde").order("company"));
  return formSheet({
    title: defect ? "Mangel" : "Mangel erfassen",
    confirm: defect ? "Sichern" : "Hinzufügen",
    values: { ...(defect ?? {}), contact_id: defect?.contact_id ?? "" },
    sections: [
      { fields: [
        { name: "title", label: "Mangel", required: true, placeholder: "z. B. Kratzer Tischplatte" },
        { name: "location", label: "Ort", placeholder: "z. B. Besprechung 2.04" },
      ] },
      { fields: [
        { name: "contact_id", label: "Zuständig", type: "select", options: [["", "Noch offen"], ...contacts.map((c) => [c.id, who(c)])] },
        { name: "due_date", label: "Frist", type: "date" },
      ], footer: "Ist die Frist überschritten, legt DOM automatisch eine Erinnerungsmail an den Zuständigen als Gmail-Entwurf an." },
      { fields: [
        { name: "photo", label: defect?.file_id ? "Foto ersetzen" : "Foto", type: "file", accept: "image/*" },
        { name: "notes", label: "Notizen", type: "textarea", rows: 3 },
      ] },
    ],
    destructive: defect ? {
      label: "Mangel löschen", confirmTitle: "Mangel löschen?",
      onConfirm: () => q(db.from("defects").delete().eq("id", defect.id)),
    } : null,
    onSubmit: async (v) => {
      let fileId = defect?.file_id ?? null;
      if (v.photo?.length) fileId = (await uploadFile(v.photo[0], { projectId, kind: "foto", caption: `Mangel: ${v.title}` })).id;
      const row = {
        project_id: projectId, title: v.title, location: v.location, contact_id: v.contact_id || null,
        due_date: v.due_date, notes: v.notes, file_id: fileId,
      };
      if (defect && row.due_date !== defect.due_date) row.followup_at = null;
      return defect
        ? q(db.from("defects").update(row).eq("id", defect.id).select().single())
        : q(db.from("defects").insert(row).select().single());
    },
  });
}

async function setStatus(d, status, after) {
  await q(db.from("defects").update({ status, fixed_at: status === "behoben" ? new Date().toISOString() : null }).eq("id", d.id));
  after();
  if (status === "behoben") toast("Mangel behoben", { undo: async () => { await setStatus(d, "offen", after); } });
}

function mailInstruction(p, contact, list) {
  return `Schreibe eine höfliche, bestimmte E-Mail an ${who(contact)} mit der Bitte, folgende Mängel im Projekt „${p.name}“${p.address ? ` (${p.address})` : ""} zu beheben und einen Termin zu nennen:
${list.map((d) => `- ${d.title}${d.location ? ` (${d.location})` : ""}${d.due_date ? `, Frist ${fmtDate(d.due_date)}` : ""}`).join("\n")}`;
}

function printSheet(p, rows) {
  const html = `<div class="no-print row mb-16"><button class="btn btn-filled" onclick="window.print()">${icon("print", "sm")}Drucken</button>
    <span class="t-footnote secondary">Mängelliste für Abnahme oder Baubesprechung.</span></div>
    <div class="print-doc">
      <h1 class="t-title2">Mängelliste – ${esc(p.name)}</h1>
      <p class="secondary mb-16">${esc(p.address ?? "")} · Stand ${fmtDateLong(isoDate())}</p>
      <table class="print-table"><thead><tr><th>#</th><th>Mangel</th><th>Ort</th><th>Zuständig</th><th>Frist</th><th>Status</th><th>Foto</th></tr></thead>
      <tbody>${rows.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.title)}${d.notes ? `<br><small>${esc(d.notes)}</small>` : ""}</td><td>${esc(d.location ?? "")}</td>
        <td>${esc(who(d.contacts))}</td><td>${d.due_date ? fmtDate(d.due_date) : ""}</td><td>${d.status === "behoben" ? "behoben" : "offen"}</td>
        <td>${d.files ? `<img data-path="${esc(d.files.storage_path)}" alt="">` : ""}</td></tr>`).join("")}</tbody></table>
    </div>`;
  const sheet = contentSheet({ title: "Mängelliste", html, wide: true });
  const style = document.createElement("style");
  style.textContent = "@media print { body > *:not(dialog) { display:none !important } dialog.sheet { position:static; width:auto; max-height:none; box-shadow:none; background:#fff } .sheet-bar,.grabber { display:none } }";
  sheet.appendChild(style);
  hydrateImages(sheet);
}

export default async function defects(ctx) {
  const id = ctx.params[0];
  const filter = ctx.query.get("filter") ?? "offen";
  const [p, all] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("defects").select("*, contacts(id, company, name, email), files(storage_path)").eq("project_id", id).order("status").order("due_date", { nullsFirst: false }).order("created_at")),
  ]);
  const rows = filter === "alle" ? all : all.filter((d) => d.status === filter);
  const open = all.filter((d) => d.status === "offen");
  const overdue = open.filter((d) => d.due_date && d.due_date < isoDate());
  const withContact = open.filter((d) => d.contacts?.email);

  ctx.root.innerHTML = `
    ${header({ title: "Mängel", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name },
      actions: `${all.length ? navButton("print", "print", "Mängelliste drucken") : ""}${navButton("add", "plus", "Mangel erfassen")}` })}
    <div class="page">
      ${all.length ? `
        <div class="grid cols-3 mb-24">
          <div class="card metric"><span class="label">Offen</span><span class="value">${open.length}</span></div>
          <div class="card metric"><span class="label">Überfällig</span><span class="value ${overdue.length ? "critical" : ""}">${overdue.length}</span></div>
          <div class="card metric"><span class="label">Behoben</span><span class="value">${all.length - open.length}</span></div>
        </div>
        <div class="spread mb-16">${segmented("filter", [["offen", "Offen"], ["behoben", "Behoben"], ["alle", "Alle"]], filter)}
          ${withContact.length ? `<button class="btn btn-tinted small" data-action="mail-all">${icon("mail", "sm")}Handwerker erinnern</button>` : ""}</div>
        ${rows.length ? `<section class="group"><ul class="list">${rows.map((d) => {
          const late = d.status === "offen" && d.due_date && d.due_date < isoDate();
          const sub = [d.location ? esc(d.location) : "", d.contacts ? esc(who(d.contacts)) : '<span class="tertiary">Zuständig offen</span>',
            d.due_date ? `<span class="${late ? "critical" : ""}">${late ? "Überfällig · " : "Frist "}${relDay(d.due_date)}</span>` : ""].filter(Boolean).join(" · ");
          return `<li><div class="cell ${d.status === "behoben" ? "done" : ""}">
            <button class="check" role="checkbox" aria-checked="${d.status === "behoben"}" aria-label="${esc(d.title)} behoben" data-toggle="${d.id}">${icon("check")}</button>
            ${d.files ? `<span class="defect-photo"><img data-path="${esc(d.files.storage_path)}" alt=""></span>` : ""}
            <button class="cell-text plain" data-edit="${d.id}"><span class="cell-title">${esc(d.title)}</span><span class="cell-sub">${sub}</span></button>
            ${d.status === "offen" && d.contacts?.email ? `<button class="icon-btn" data-mail="${d.id}" aria-label="Erinnerung an ${esc(who(d.contacts))}">${icon("mail")}</button>` : ""}
          </div></li>`;
        }).join("")}</ul></section>` : `<p class="group-footer">Keine ${filter === "behoben" ? "behobenen" : "offenen"} Mängel.</p>`}`
      : empty({ icon: "wrench", title: "Keine Mängel",
          text: "Erfasse Mängel bei Besichtigung oder Abnahme mit Foto, Ort, Handwerker und Frist. Per WhatsApp geht es auch: „Mangel Huber: Kratzer Tisch 2.04, Tischler Maier, bis Freitag“ plus Foto.",
          action: '<button class="btn btn-filled" data-action="add">Mangel erfassen</button>' })}
    </div>`;
  hydrateImages(ctx.root);

  ctx.root.addEventListener("click", async (e) => {
    try {
      const t = e.target.closest("[data-toggle]");
      if (t) {
        const d = all.find((x) => x.id === t.dataset.toggle);
        const fixed = t.getAttribute("aria-checked") !== "true";
        t.setAttribute("aria-checked", String(fixed));
        t.closest(".cell").classList.toggle("done", fixed);
        await setStatus(d, fixed ? "behoben" : "offen", () => setTimeout(ctx.rerender, 350));
        return;
      }
      const ed = e.target.closest("[data-edit]");
      if (ed) { if (await defectSheet(id, all.find((x) => x.id === ed.dataset.edit))) ctx.rerender(); return; }
      const m = e.target.closest("[data-mail]");
      if (m) {
        const d = all.find((x) => x.id === m.dataset.mail);
        const list = open.filter((x) => x.contact_id === d.contact_id);
        toast("Der Assistent formuliert die E-Mail …", { duration: 3000 });
        const mail = await draftWithAI(mailInstruction(p, d.contacts, list));
        await mailSheet({ to: d.contacts.email, subject: mail.subject, body: mail.body, title: "Mängel melden" });
        return;
      }
      if (e.target.closest("[data-seg] button")) {
        location.hash = `#/projekte/${id}/maengel?filter=${e.target.closest("button").dataset.value}`;
        return;
      }
      const a = e.target.closest("[data-action]");
      if (!a) return;
      if (a.dataset.action === "add" && await defectSheet(id)) ctx.rerender();
      if (a.dataset.action === "print") printSheet(p, all);
      if (a.dataset.action === "mail-all") {
        const groups = new Map();
        for (const d of withContact) groups.set(d.contact_id, [...(groups.get(d.contact_id) ?? []), d]);
        a.disabled = true;
        toast(`Der Assistent schreibt ${groups.size} E-Mail${groups.size > 1 ? "s" : ""} …`, { duration: 4000 });
        const { signature } = await import("./settings.js").then((mod) => mod.signature());
        for (const list of groups.values()) {
          const mail = await draftWithAI(mailInstruction(p, list[0].contacts, list));
          await api("/google/draft", { to: list[0].contacts.email, subject: mail.subject, body: signature ? `${mail.body}\n\n${signature}` : mail.body });
        }
        toast(`${groups.size} Entw${groups.size > 1 ? "ürfe" : "urf"} in Gmail angelegt`);
        a.disabled = false;
      }
    } catch (err) { errorToast(err); }
  });
}
