// Kunden-Freigaben: Plan, Entwurf oder Visualisierung per Link freigeben lassen – ohne Login für den Kunden.
import { db, q, uploadFile } from "../supa.js";
import { icon } from "../icons.js";
import { actionSheet, confirmDialog, empty, errorToast, esc, fmtDate, formSheet, header, navButton, toast } from "../ui.js";
import { mailSheet } from "./mail.js";

export const approvalUrl = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}freigabe.html#${token}`;

const STATUS = {
  offen: ["Wartet", "warning", "clock"],
  freigegeben: ["Freigegeben", "positive", "check"],
  abgelehnt: ["Abgelehnt", "critical", "close"],
};

async function approvalSheet(projectId) {
  const files = await q(db.from("files").select("id, name, caption, kind").eq("project_id", projectId).in("kind", ["plan", "visualisierung", "foto", "dokument", "cad"]).order("created_at", { ascending: false }).limit(50));
  return formSheet({
    title: "Freigabe anfordern",
    confirm: "Erstellen",
    values: { file_id: "" },
    sections: [
      { fields: [
        { name: "title", label: "Was", required: true, placeholder: "z. B. Möblierungsplan Variante B" },
        { name: "description", label: "Hinweis an den Kunden", type: "textarea", rows: 3, placeholder: "z. B. Bitte bis Freitag freigeben, damit wir bestellen können." },
      ] },
      { header: "Unterlage", fields: [
        ...(files.length ? [{ name: "file_id", label: "Aus Projekt", type: "select", options: [["", "Keine"], ...files.map((f) => [f.id, f.caption || f.name])] }] : []),
        { name: "upload", label: "Neue Datei", type: "file", accept: "image/*,application/pdf" },
      ], footer: "PDF oder Bild. Der Kunde sieht nur diese Unterlage, nicht das restliche Projekt." },
    ],
    onSubmit: async (v) => {
      let fileId = v.file_id || null;
      if (v.upload?.length) fileId = (await uploadFile(v.upload[0], { projectId, kind: v.upload[0].type === "application/pdf" ? "plan" : "visualisierung", caption: v.title })).id;
      return q(db.from("approvals").insert({ project_id: projectId, title: v.title, description: v.description, file_id: fileId }).select().single());
    },
  });
}

async function share(p, a) {
  const url = approvalUrl(a.token);
  const client = p.client_id ? await q(db.from("contacts").select("email, name, company").eq("id", p.client_id).single()) : null;
  const choice = await actionSheet({ title: a.title, actions: [
    { label: "Per E-Mail senden", value: "mail" },
    { label: "Link kopieren", value: "copy" },
    ...(navigator.share ? [{ label: "Teilen …", value: "share" }] : []),
  ] });
  if (choice === "copy") { await navigator.clipboard.writeText(url); toast("Link kopiert"); }
  if (choice === "share") await navigator.share({ title: a.title, text: `Bitte um Freigabe: ${a.title}`, url }).catch(() => {});
  if (choice === "mail") {
    await mailSheet({
      to: client?.email ?? "", title: "Freigabe anfordern",
      subject: `Bitte um Freigabe: ${a.title} – ${p.name}`,
      body: `Guten Tag${client?.name ? ` ${client.name}` : ""},\n\nanbei zur Freigabe: ${a.title}.${a.description ? `\n\n${a.description}` : ""}\n\nSie können die Unterlage hier ansehen und mit einem Klick freigeben oder Änderungswünsche angeben:\n${url}\n\nVielen Dank!`,
    });
  }
}

export default async function approvals(ctx) {
  const id = ctx.params[0];
  const [p, rows] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("approvals").select("*, files(name, mime)").eq("project_id", id).order("created_at", { ascending: false })),
  ]);

  ctx.root.innerHTML = `
    ${header({ title: "Freigaben", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name }, actions: navButton("add", "plus", "Freigabe anfordern") })}
    <div class="page">
      ${rows.length ? `<section class="group"><ul class="list">${rows.map((a) => {
        const [label, tone, ic] = STATUS[a.status];
        const sub = a.status === "offen"
          ? `Angefordert ${fmtDate(a.created_at)}${a.files ? ` · ${esc(a.files.name)}` : ""}`
          : `${esc(a.client_name ?? "")} · ${fmtDate(a.decided_at)}${a.client_comment ? ` · „${esc(a.client_comment)}“` : ""}`;
        return `<li><button class="cell" data-approval="${a.id}">
          <span class="cell-icon" style="--tint:var(--${tone === "warning" ? "system-orange" : tone === "positive" ? "system-green" : "system-red"})">${icon(ic)}</span>
          <span class="cell-text"><span class="cell-title">${esc(a.title)}</span><span class="cell-sub">${sub}</span></span>
          <span class="pill ${tone}">${label}</span><span class="chevron">${icon("chevronRight")}</span></button></li>`;
      }).join("")}</ul>
      <p class="group-footer">Sobald der Kunde entscheidet, bekommst du eine Nachricht – und die Entscheidung landet in der Dokumentation.</p></section>`
      : empty({ icon: "seal", title: "Keine Freigaben",
          text: "Schick dem Kunden einen Link zu Plan, Entwurf oder Visualisierung. Er gibt ohne Anmeldung mit einem Klick frei oder schreibt Änderungswünsche – du wirst sofort benachrichtigt.",
          action: '<button class="btn btn-filled" data-action="add">Freigabe anfordern</button>' })}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    try {
      const row = e.target.closest("[data-approval]");
      if (row) {
        const a = rows.find((x) => x.id === row.dataset.approval);
        const choice = await actionSheet({ title: a.title, actions: [
          { label: "Freigabe-Seite öffnen", value: "open" },
          ...(a.status === "offen" ? [{ label: "Erneut senden", value: "share" }] : []),
          { label: "Löschen", value: "delete", destructive: true },
        ] });
        if (choice === "open") window.open(approvalUrl(a.token), "_blank", "noopener");
        if (choice === "share") await share(p, a);
        if (choice === "delete" && await confirmDialog({ title: "Freigabe löschen?", message: "Der Link funktioniert danach nicht mehr.", confirm: "Löschen", destructive: true })) {
          await q(db.from("approvals").delete().eq("id", a.id));
          ctx.rerender();
        }
        return;
      }
      const act = e.target.closest("[data-action]");
      if (act?.dataset.action === "add") {
        const a = await approvalSheet(id);
        if (a) { ctx.rerender(); await share(p, a); }
      }
    } catch (err) { errorToast(err); }
  });
}
