// Termine: Besichtigungen, Aufmaß, Präsentationen, Lieferungen, Montage, Umzug, Abnahme.
import { api, db, q } from "../supa.js";
import { icon } from "../icons.js";
import {
  addDays, empty, errorToast, esc, fmtDateLong, fmtTime, formSheet, header, isoDate, navButton, segmented, toLocalInput, toast,
} from "../ui.js";

export const KIND = {
  termin: { label: "Termin", icon: "calendar", tint: "var(--system-gray)" },
  besichtigung: { label: "Besichtigung", icon: "building", tint: "var(--system-indigo)" },
  aufmass: { label: "Naturmaß / Aufmaß", icon: "ruler", tint: "var(--system-orange)" },
  praesentation: { label: "Präsentation", icon: "photo", tint: "var(--system-purple)" },
  lieferung: { label: "Lieferung", icon: "truck", tint: "var(--system-teal)" },
  montage: { label: "Montage", icon: "pencil", tint: "var(--system-brown)" },
  umzug: { label: "Umzug", icon: "truck", tint: "var(--system-blue)" },
  abnahme: { label: "Abnahme", icon: "check", tint: "var(--system-green)" },
};

async function googleConnected() {
  const rows = await q(db.from("connectors").select("status").eq("kind", "google").limit(1));
  return rows[0]?.status === "verbunden";
}

export async function appointmentSheet({ appt = null, projectId = null, kind = "termin" }) {
  const [projects, google] = await Promise.all([
    projectId ? [] : q(db.from("projects").select("id, name, address").eq("status", "aktiv").order("name")),
    googleConnected(),
  ]);
  const duration = appt?.ends_at ? Math.round((new Date(appt.ends_at) - new Date(appt.starts_at)) / 60000) : 60;
  const tomorrow9 = `${addDays(isoDate(), 1)}T09:00`;
  return formSheet({
    title: appt ? "Termin" : "Neuer Termin",
    confirm: appt ? "Sichern" : "Hinzufügen",
    values: {
      ...(appt ?? { kind, remind_minutes: 60 }),
      project_id: appt?.project_id ?? projectId ?? "",
      start: appt ? toLocalInput(appt.starts_at) : tomorrow9,
      duration: String(duration),
      google: google && (!appt || Boolean(appt.google_event_id)),
    },
    sections: [
      { fields: [
        { name: "title", label: "Titel", required: true, placeholder: "z. B. Baustellenbesichtigung" },
        { name: "kind", label: "Art", type: "select", options: Object.entries(KIND).map(([k, v]) => [k, v.label]) },
        ...(projects.length ? [{ name: "project_id", label: "Projekt", type: "select", options: [["", "Ohne Projekt"], ...projects.map((p) => [p.id, p.name])] }] : []),
      ] },
      { fields: [
        { name: "start", label: "Beginn", type: "datetime-local", required: true },
        { name: "duration", label: "Dauer", type: "select", options: [["30", "30 Min."], ["60", "1 Std."], ["90", "1,5 Std."], ["120", "2 Std."], ["240", "4 Std."], ["480", "Ganzer Tag"]] },
        { name: "location", label: "Ort", placeholder: "Adresse" },
      ] },
      { fields: [
        { name: "remind_minutes", label: "Erinnerung", type: "select", options: [["15", "15 Min. vorher"], ["30", "30 Min. vorher"], ["60", "1 Std. vorher"], ["120", "2 Std. vorher"], ["1440", "1 Tag vorher"]] },
        ...(google ? [{ name: "google", label: "In Google Kalender", type: "switch" }] : []),
      ], footer: google ? "" : "Tipp: Verbinde Google in den Konnektoren, dann landen Termine automatisch in deinem Kalender." },
      { fields: [{ name: "notes", label: "Notizen", type: "textarea", rows: 3 }] },
    ],
    destructive: appt ? { label: "Termin löschen", confirmTitle: "Termin löschen?", onConfirm: () => q(db.from("appointments").delete().eq("id", appt.id)) } : null,
    onSubmit: async (v) => {
      const starts = new Date(v.start);
      const row = {
        title: v.title, kind: v.kind, project_id: v.project_id || projectId || null,
        starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + Number(v.duration) * 60000).toISOString(),
        location: v.location ?? (projects.find((p) => p.id === v.project_id)?.address ?? null),
        remind_minutes: Number(v.remind_minutes), notes: v.notes,
      };
      if (!appt || row.starts_at !== appt.starts_at) row.reminded_at = null;
      const saved = appt
        ? await q(db.from("appointments").update(row).eq("id", appt.id).select().single())
        : await q(db.from("appointments").insert(row).select().single());
      if (v.google) {
        try { await api("/google/calendar", { appointment_id: saved.id }); }
        catch (e) { toast(`Gespeichert, aber Google Kalender: ${e.message}`, { duration: 7000 }); }
      }
      return saved;
    },
  });
}

/** Legt wöchentliche Besichtigungen bis zur Übergabe an (Projektüberwachung). */
async function planInspections(project) {
  const until = project.end_date ?? addDays(project.move_date ?? isoDate(), 14);
  return formSheet({
    title: "Besichtigungen planen",
    confirm: "Anlegen",
    values: { first: `${addDays(isoDate(), 7 - ((new Date().getDay() + 6) % 7))}T09:00`, until, every: "7" },
    sections: [{ fields: [
      { name: "first", label: "Erster Termin", type: "datetime-local", required: true },
      { name: "every", label: "Rhythmus", type: "select", options: [["7", "Wöchentlich"], ["14", "Alle 2 Wochen"]] },
      { name: "until", label: "Bis", type: "date", required: true },
    ], footer: "Legt regelmäßige Baustellenbesichtigungen an. Nach jeder Besichtigung kannst du per WhatsApp den Stand melden – der Assistent schreibt die Doku." }],
    onSubmit: async (v) => {
      const rows = [];
      for (let d = new Date(v.first); isoDate(d) <= v.until; d = new Date(d.getTime() + Number(v.every) * 86400000)) {
        rows.push({ project_id: project.id, title: "Baustellenbesichtigung", kind: "besichtigung", starts_at: d.toISOString(),
          ends_at: new Date(d.getTime() + 3600000).toISOString(), location: project.address, remind_minutes: 60 });
        if (rows.length > 60) break;
      }
      await q(db.from("appointments").insert(rows));
      return rows.length;
    },
  });
}

export default async function appointments(ctx) {
  const projectId = ctx.params[0] ?? null;
  const when = ctx.query.get("zeit") ?? "kommend";
  const now = new Date().toISOString();
  let query = db.from("appointments").select("*, projects(name)");
  if (projectId) query = query.eq("project_id", projectId);
  query = when === "kommend"
    ? query.gte("starts_at", new Date(Date.now() - 2 * 3600000).toISOString()).order("starts_at").limit(200)
    : query.lt("starts_at", now).order("starts_at", { ascending: false }).limit(100);
  const [rows, project] = await Promise.all([
    q(query),
    projectId ? q(db.from("projects").select("*").eq("id", projectId).single()) : null,
  ]);

  const byDay = new Map();
  for (const a of rows) {
    const day = isoDate(new Date(a.starts_at));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(a);
  }
  const base = projectId ? `#/projekte/${projectId}/termine` : "#/termine";

  ctx.root.innerHTML = `
    ${header({ title: projectId ? "Termine" : "Termine", subtitle: project ? esc(project.name) : "",
      back: project ? { href: `#/projekte/${projectId}`, label: project.name } : null,
      actions: navButton("add", "plus", "Neuer Termin") })}
    <div class="page">
      <div class="spread">${segmented("zeit", [["kommend", "Anstehend"], ["vergangen", "Vergangen"]], when)}
        ${project ? '<button class="btn btn-tinted small mb-16" data-action="inspections">Besichtigungen planen</button>' : ""}</div>
      ${rows.length ? [...byDay.entries()].map(([day, list]) => `
        <section class="group"><h2 class="group-header small">${fmtDateLong(day)}${day === isoDate() ? " · Heute" : ""}</h2>
        <ul class="list with-icons">${list.map((a) => `<li><button class="cell" data-appt="${a.id}">
          <span class="cell-icon" style="--tint:${KIND[a.kind]?.tint}">${icon(KIND[a.kind]?.icon ?? "calendar")}</span>
          <span class="cell-text"><span class="cell-title">${esc(a.title)}</span>
            <span class="cell-sub">${[KIND[a.kind]?.label, projectId ? "" : a.projects?.name, a.location].filter(Boolean).map(esc).join(" · ")}</span></span>
          <span class="cell-detail"><span class="t-headline" style="color:var(--label)">${fmtTime(a.starts_at)}</span>${a.google_event_id ? `<br><span class="t-caption">Google</span>` : ""}</span>
        </button></li>`).join("")}</ul></section>`).join("")
      : empty({ icon: "calendar", title: when === "kommend" ? "Keine anstehenden Termine" : "Keine vergangenen Termine",
          text: "Aufmaß, Präsentationen, Lieferungen, Montage und Besichtigungen – mit Erinnerung per WhatsApp.",
          action: '<button class="btn btn-filled" data-action="add">Termin anlegen</button>' })}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-seg] button");
    if (seg) { location.hash = `${base}?zeit=${seg.dataset.value}`; return; }
    try {
      const row = e.target.closest("[data-appt]");
      if (row) {
        const appt = rows.find((r) => r.id === row.dataset.appt);
        if (await appointmentSheet({ appt, projectId })) ctx.rerender();
        return;
      }
      const a = e.target.closest("[data-action]");
      if (a?.dataset.action === "add" && await appointmentSheet({ projectId })) ctx.rerender();
      if (a?.dataset.action === "inspections") {
        const n = await planInspections(project);
        if (n) { toast(`${n} Besichtigungen angelegt`); ctx.rerender(); }
      }
    } catch (err) { errorToast(err); }
  });
}
