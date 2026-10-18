// Heute: Was steht an? Termine, fällige und überfällige Aufgaben, Budget-Hinweise, Projektstand.
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import { actionSheet, budgetPill, empty, errorToast, esc, eur, fmtDate, schedulePill, fmtDateLong, fmtTime, header, isoDate, navButton, ring } from "../ui.js";
import { bindTasks, newProject, taskRow, taskSheet } from "./projects.js";
import { appointmentSheet, KIND } from "./appointments.js";
import { weekStrip } from "./calendar.js";

export default async function today(ctx) {
  const day = isoDate();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const [tasks, appts, projects, profile, waConnector, week] = await Promise.all([
    q(db.from("tasks").select("*, projects(name, status)").eq("done", false).lte("due_date", day).order("due_date").order("position").limit(60)),
    q(db.from("appointments").select("*, projects(name)").gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at")),
    q(db.from("v_project_status").select("*").eq("status", "aktiv").order("move_date", { nullsFirst: false })),
    q(db.from("profiles").select("user_name").maybeSingle()),
    q(db.from("connectors").select("id").eq("kind", "whatsapp").limit(1)),
    weekStrip().catch(() => ""),
  ]);
  const active = tasks.filter((t) => !t.projects || t.projects.status === "aktiv");
  const overdue = active.filter((t) => t.due_date < day);
  const due = active.filter((t) => t.due_date === day);
  const warnings = projects.filter((p) => p.budget_state === "knapp" || p.budget_state === "ueberschritten");
  const hour = new Date().getHours();
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";

  ctx.root.innerHTML = `
    ${header({ title: "Heute", subtitle: `${fmtDateLong(day)} · ${greet}${profile?.user_name ? `, ${esc(profile.user_name)}` : ""}`,
      actions: `<a class="icon-btn" href="#/einstellungen" aria-label="Einstellungen">${icon("settings")}</a>${navButton("add", "plus", "Neu")}` })}
    <div class="page">
      ${week ? `<section class="group"><h2 class="group-header">Diese Woche<a class="btn btn-plain" href="#/termine">Kalender</a></h2>${week}</section>` : ""}
      <div class="grid cols-3 mb-24">
        <div class="card metric"><span class="label">${icon("calendar", "sm")}Termine heute</span><span class="value">${appts.length}</span></div>
        <div class="card metric"><span class="label">${icon("check", "sm")}Heute fällig</span><span class="value">${due.length}</span></div>
        <div class="card metric"><span class="label ${overdue.length ? "critical" : ""}">${icon("clock", "sm")}Überfällig</span><span class="value ${overdue.length ? "critical" : ""}">${overdue.length}</span></div>
      </div>

      ${!projects.length ? `<div class="card mb-24">${empty({ icon: "projects", title: "Willkommen bei DOM",
        text: "Leg dein erstes Projekt an. DOM plant automatisch alle Phasen – vom Naturmaß über Ausschreibung und Angebotsvergleich bis zur Abnahme – und erinnert dich an jeden Schritt.",
        action: '<button class="btn btn-filled" data-action="new-project">Erstes Projekt anlegen</button>' })}</div>` : ""}

      ${appts.length ? `<section class="group"><h2 class="group-header">Termine</h2><ul class="list with-icons">${appts.map((a) => `
        <li><a class="cell" href="#/projekte/${a.project_id ?? ""}/termine" ${a.project_id ? "" : 'data-noproj="1"'}>
          <span class="cell-icon" style="--tint:${KIND[a.kind]?.tint ?? "var(--system-red)"}">${icon(KIND[a.kind]?.icon ?? "calendar")}</span>
          <span class="cell-text"><span class="cell-title">${esc(a.title)}</span><span class="cell-sub">${[a.projects?.name, a.location].filter(Boolean).map(esc).join(" · ")}</span></span>
          <span class="cell-detail t-headline">${fmtTime(a.starts_at)}</span></a></li>`).join("")}</ul></section>` : ""}

      ${projects.length ? `<section class="group"><h2 class="group-header">Heute zu tun<button class="btn btn-plain" data-action="add-task">Aufgabe</button></h2>
        ${due.length ? `<ul class="list">${due.map((t) => taskRow(t, { showProject: true })).join("")}</ul>`
          : `<div class="card t-subhead secondary">Für heute ist nichts fällig. ${overdue.length ? "Zeit, Überfälliges nachzuholen." : "Gut gemacht."}</div>`}
      </section>` : ""}

      ${overdue.length ? `<section class="group"><h2 class="group-header">Überfällig</h2>
        <ul class="list">${overdue.map((t) => taskRow(t, { showProject: true })).join("")}</ul></section>` : ""}

      ${warnings.length ? `<section class="group"><h2 class="group-header">Budget im Blick</h2><ul class="list with-icons">${warnings.map((p) => `
        <li><a class="cell" href="#/projekte/${p.project_id}/budget"><span class="cell-icon" style="--tint:var(--${p.budget_state === "knapp" ? "warning" : "critical"})">${icon("warning")}</span>
          <span class="cell-text"><span class="cell-title">${esc(p.name)}</span><span class="cell-sub">Prognose ${eur(p.forecast)} von ${eur(p.budget_total)}</span></span>
          ${budgetPill(p.budget_state)}<span class="chevron">${icon("chevronRight")}</span></a></li>`).join("")}</ul></section>` : ""}

      ${projects.length ? `<section class="group"><h2 class="group-header">Projekte</h2><ul class="list">${projects.map((p) => `
        <li><a class="cell" href="#/projekte/${p.project_id}">${ring(p.progress_pct, 40)}
          <span class="cell-text"><span class="cell-title">${esc(p.name)}</span><span class="cell-sub">${esc(p.current_phase ?? "Abgeschlossen")}${p.current_phase_due ? ` · bis ${fmtDate(p.current_phase_due)}` : ""}</span></span>
          ${schedulePill(p)}<span class="chevron">${icon("chevronRight")}</span></a></li>`).join("")}</ul></section>` : ""}

      ${projects.length && !waConnector.length ? `<section class="group"><a class="card row" href="#/einstellungen/konnektoren" style="color:inherit">
        <span class="cell-icon" style="--tint:var(--system-green)">${icon("whatsapp")}</span>
        <span class="cell-text"><span class="t-headline">Erinnerungen per WhatsApp</span><span class="cell-sub">Verbinde WhatsApp, dann schickt dir der Assistent jeden Morgen dein Briefing und erinnert dich an Termine.</span></span>
        <span class="chevron">${icon("chevronRight")}</span></a></section>` : ""}
    </div>`;

  bindTasks(ctx.root, ctx.rerender);
  ctx.root.addEventListener("click", async (e) => {
    const noProj = e.target.closest("[data-noproj]");
    if (noProj) { e.preventDefault(); location.hash = "#/termine"; return; }
    const a = e.target.closest("[data-action]");
    if (!a) return;
    try {
      if (a.dataset.action === "new-project") await newProject();
      if (a.dataset.action === "add-task") { if (await taskSheet()) ctx.rerender(); }
      if (a.dataset.action === "add") {
        const c = await actionSheet({ actions: [
          { label: "Aufgabe", value: "task" }, { label: "Termin", value: "appt" }, { label: "Projekt", value: "project" },
        ] });
        if (c === "task" && await taskSheet()) ctx.rerender();
        if (c === "appt" && await appointmentSheet({})) ctx.rerender();
        if (c === "project") await newProject();
      }
    } catch (err) { errorToast(err); }
  });
}
