// Projekte: Liste und Projektübersicht mit Fahrplan (Phasen → Aufgaben).
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import {
  actionSheet, budgetPill, confirmDialog, empty, errorToast, esc, eur, fmtDate, formSheet, header, isoDate,
  navButton, progress, relDay, ring, segmented, toast,
} from "../ui.js";

// ---------------------------------------------------------------- Projekt anlegen / bearbeiten

async function findOrCreateClient(name) {
  if (!name) return null;
  const found = await q(db.from("contacts").select("id").eq("kind", "kunde").ilike("company", name).limit(1));
  if (found.length) return found[0].id;
  return (await q(db.from("contacts").insert({ kind: "kunde", company: name }).select("id").single())).id;
}

export async function projectSheet(project = null) {
  const clientName = project?.client_id
    ? (await q(db.from("contacts").select("company, name").eq("id", project.client_id).single())).company ?? ""
    : "";
  const isNew = !project;
  return formSheet({
    title: isNew ? "Neues Projekt" : "Projekt bearbeiten",
    confirm: isNew ? "Anlegen" : "Sichern",
    values: { ...(project ?? { start_date: isoDate() }), client: clientName },
    sections: [
      { fields: [
        { name: "name", label: "Name", required: true, placeholder: "z. B. Kanzlei Huber – 3. OG" },
        { name: "client", label: "Kunde", placeholder: "Firma" },
        { name: "address", label: "Adresse", placeholder: "Straße, Ort" },
      ] },
      { header: "Termine", fields: [
        { name: "start_date", label: "Start", type: "date", required: true },
        { name: "move_date", label: "Umzug", type: "date" },
        { name: "end_date", label: "Übergabe", type: "date" },
      ], footer: isNew ? "Aus diesen Terminen plant DOM die 13 Phasen von Naturmaß bis Abnahme automatisch. Du kannst alles später anpassen." : "" },
      { header: "Eckdaten", fields: [
        { name: "budget_total", label: "Budget", type: "money", suffix: "€", placeholder: "0" },
        { name: "workplaces", label: "Arbeitsplätze", type: "number", placeholder: "0" },
        { name: "area_sqm", label: "Fläche", type: "number", suffix: "m²", placeholder: "0" },
      ] },
      { header: "Konzept", fields: [
        { name: "style", label: "Stil & Materialien", type: "textarea", rows: 3, placeholder: "z. B. hell, Eiche natur, viel Akustik, Open Space mit Rückzugsboxen" },
        { name: "description", label: "Notizen", type: "textarea", rows: 3 },
      ], footer: "Die Konzept-Stichworte nutzt der Assistent für Entwürfe und Visualisierungen." },
    ],
    destructive: isNew ? null : {
      label: "Projekt löschen",
      confirmTitle: `„${project.name}“ löschen?`,
      message: "Alle Phasen, Aufgaben, Budgets, Angebote und Dateien dieses Projekts werden gelöscht.",
      onConfirm: async () => { await q(db.from("projects").delete().eq("id", project.id)); location.hash = "#/projekte"; },
    },
    onSubmit: async (v) => {
      const row = {
        name: v.name, address: v.address, start_date: v.start_date, move_date: v.move_date, end_date: v.end_date,
        budget_total: v.budget_total ?? 0, workplaces: v.workplaces, area_sqm: v.area_sqm, style: v.style, description: v.description,
        client_id: await findOrCreateClient(v.client),
      };
      if (isNew) {
        const p = await q(db.from("projects").insert(row).select().single());
        await q(db.rpc("apply_project_template", { p_project: p.id }));
        return p;
      }
      return q(db.from("projects").update(row).eq("id", project.id).select().single());
    },
  });
}

export async function newProject() {
  const p = await projectSheet();
  if (p) { toast(`„${p.name}“ angelegt`); location.hash = `#/projekte/${p.id}`; }
}

// ---------------------------------------------------------------- Liste

async function list(ctx) {
  const filter = ctx.query.get("filter") ?? "aktiv";
  let query = db.from("v_project_status").select("*").order("move_date", { ascending: true, nullsFirst: false });
  if (filter === "aktiv") query = query.eq("status", "aktiv");
  const rows = await q(query);

  ctx.root.innerHTML = `
    ${header({ title: "Projekte", actions: navButton("new", "plus", "Neues Projekt") })}
    <div class="page">
      <div class="spread">${segmented("filter", [["aktiv", "Aktiv"], ["alle", "Alle"]], filter)}</div>
      <label class="search">${icon("search", "sm")}<span class="sr-only">Projekte suchen</span>
        <input type="search" placeholder="Projekt oder Adresse suchen" data-search></label>
      ${rows.length ? `<ul class="list" data-list>${rows.map((p) => `
        <li data-text="${esc(`${p.name}`.toLowerCase())}"><a class="cell" href="#/projekte/${p.project_id}">
          ${ring(p.progress_pct, 44)}
          <span class="cell-text">
            <span class="cell-title t-headline">${esc(p.name)}</span>
            <span class="cell-sub">${esc(p.current_phase ?? "Alle Phasen erledigt")}${p.move_date ? ` · Umzug ${fmtDate(p.move_date)}` : ""}</span>
            <span class="row" style="margin-top:4px">${budgetPill(p.budget_state)}${p.overdue > 0 ? `<span class="pill critical">${icon("clock")}${p.overdue} überfällig</span>` : ""}${p.status !== "aktiv" ? `<span class="pill">${esc(p.status)}</span>` : ""}</span>
          </span>
          <span class="chevron">${icon("chevronRight")}</span></a></li>`).join("")}</ul>`
        : empty({ icon: "projects", title: filter === "aktiv" ? "Keine aktiven Projekte" : "Noch keine Projekte",
          text: "Lege ein Projekt an – DOM erstellt den kompletten Fahrplan von Naturmaß bis Abnahme mit Terminen und Budgetkategorien.",
          action: '<button class="btn btn-filled" data-action="new">Projekt anlegen</button>' })}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-action], [data-seg] button");
    if (!t) return;
    if (t.dataset.action === "new") newProject().catch(errorToast);
    if (t.closest("[data-seg]")) location.hash = `#/projekte?filter=${t.dataset.value}`;
  });
  ctx.root.querySelector("[data-search]").addEventListener("input", (e) => {
    const s = e.target.value.toLowerCase();
    ctx.root.querySelectorAll("[data-list] > li").forEach((li) => { li.hidden = s && !li.dataset.text.includes(s); });
  });
}

// ---------------------------------------------------------------- Aufgaben

export function taskRow(t, { showProject = false } = {}) {
  const overdue = !t.done && t.due_date && t.due_date < isoDate();
  const sub = [
    showProject && t.projects?.name ? esc(t.projects.name) : "",
    t.due_date ? `<span class="${overdue ? "critical" : ""}">${overdue ? "Überfällig · " : ""}${relDay(t.due_date)}</span>` : "",
    t.remind_at && !t.done ? `${icon("bell", "sm")}` : "",
  ].filter(Boolean).join(" · ");
  return `<li><div class="cell ${t.done ? "done" : ""}" data-task="${t.id}">
    <button class="check" role="checkbox" aria-checked="${t.done}" aria-label="${esc(t.title)} erledigt" data-toggle="${t.id}">${icon("check")}</button>
    <span class="cell-text"><span class="cell-title">${esc(t.title)}</span>${sub ? `<span class="cell-sub">${sub}</span>` : ""}</span>
    <button class="icon-btn" data-edit-task="${t.id}" aria-label="Aufgabe bearbeiten">${icon("ellipsis")}</button>
  </div></li>`;
}

export async function toggleTask(id, done, after) {
  await q(db.from("tasks").update({ done }).eq("id", id));
  after?.();
  if (done) {
    toast("Aufgabe erledigt", { undo: async () => { await q(db.from("tasks").update({ done: false }).eq("id", id)); after?.(); } });
  }
}

export async function taskSheet({ task = null, projectId = null, phaseId = null } = {}) {
  const phases = projectId || task?.project_id
    ? await q(db.from("phases").select("id, title").eq("project_id", projectId ?? task.project_id).order("position"))
    : [];
  const projects = projectId || task?.project_id ? [] : await q(db.from("projects").select("id, name").eq("status", "aktiv").order("name"));
  const remind = task?.remind_at ? new Date(task.remind_at) : null;
  const v = {
    ...(task ?? {}),
    phase_id: task?.phase_id ?? phaseId ?? "",
    project_id: task?.project_id ?? projectId ?? "",
    remind_local: remind ? `${isoDate(remind)}T${String(remind.getHours()).padStart(2, "0")}:${String(remind.getMinutes()).padStart(2, "0")}` : "",
  };
  return formSheet({
    title: task ? "Aufgabe" : "Neue Aufgabe",
    confirm: task ? "Sichern" : "Hinzufügen",
    values: v,
    sections: [
      { fields: [
        { name: "title", label: "Titel", required: true, placeholder: "Was ist zu tun?" },
        ...(projects.length ? [{ name: "project_id", label: "Projekt", type: "select", options: [["", "Ohne Projekt"], ...projects.map((p) => [p.id, p.name])] }] : []),
        ...(phases.length ? [{ name: "phase_id", label: "Phase", type: "select", options: [["", "Keine"], ...phases.map((p) => [p.id, p.title])] }] : []),
      ] },
      { fields: [
        { name: "due_date", label: "Fällig", type: "date" },
        { name: "remind_local", label: "Erinnerung", type: "datetime-local" },
      ], footer: "Erinnerungen kommen per WhatsApp, sobald WhatsApp in den Konnektoren eingerichtet ist – sonst im Assistenten." },
      { fields: [{ name: "notes", label: "Notizen", type: "textarea", rows: 3 }] },
    ],
    destructive: task ? {
      label: "Aufgabe löschen", confirmTitle: "Aufgabe löschen?",
      onConfirm: () => q(db.from("tasks").delete().eq("id", task.id)),
    } : null,
    onSubmit: async (f) => {
      const row = {
        title: f.title, due_date: f.due_date, notes: f.notes,
        phase_id: f.phase_id || null, project_id: f.project_id || projectId || task?.project_id || null,
        remind_at: f.remind_local ? new Date(f.remind_local).toISOString() : null,
      };
      if (task && row.remind_at !== task.remind_at) row.reminded_at = null;
      return task
        ? q(db.from("tasks").update(row).eq("id", task.id).select().single())
        : q(db.from("tasks").insert(row).select().single());
    },
  });
}

/** Gemeinsame Klick-Logik für Aufgabenlisten (abhaken, bearbeiten). */
export function bindTasks(root, rerender) {
  root.addEventListener("click", async (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const done = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", String(done));
      toggle.closest(".cell").classList.toggle("done", done);
      toggleTask(toggle.dataset.toggle, done, () => setTimeout(rerender, 350)).catch(errorToast);
      return;
    }
    const edit = e.target.closest("[data-edit-task]");
    if (edit) {
      const task = await q(db.from("tasks").select("*").eq("id", edit.dataset.editTask).single());
      if (await taskSheet({ task })) rerender();
    }
  });
}

// ---------------------------------------------------------------- Projektübersicht

async function count(table, projectId) {
  const { count: n } = await db.from(table).select("id", { count: "exact", head: true }).eq("project_id", projectId);
  return n ?? 0;
}

async function detail(ctx) {
  const id = ctx.params[0];
  const [p, s, phases, tasks, nItems, nTenders, nLogs, nFiles, nRooms, nextAppt, client] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("v_project_status").select("*").eq("project_id", id).single()),
    q(db.from("phases").select("*").eq("project_id", id).order("position")),
    q(db.from("tasks").select("*").eq("project_id", id).order("position")),
    count("items", id), count("tenders", id), count("logs", id), count("files", id), count("move_rooms", id),
    q(db.from("appointments").select("title, starts_at").eq("project_id", id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1)),
    db.from("projects").select("contacts(company, name)").eq("id", id).single().then((r) => r.data?.contacts),
  ]);
  const openPhaseId = ctx.query.get("phase") ?? phases.find((ph) => ph.status !== "erledigt")?.id;
  const daysToMove = p.move_date ? Math.round((new Date(`${p.move_date}T12:00`) - new Date()) / 86400000) : null;
  const budgetTone = { im_budget: "positive", knapp: "warning", ueberschritten: "critical" }[s.budget_state] ?? "";
  const budgetPct = p.budget_total > 0 ? Math.round((s.forecast / p.budget_total) * 100) : 0;
  const tasksOfPhase = (phId) => tasks.filter((t) => t.phase_id === phId);
  const looseTasks = tasks.filter((t) => !t.phase_id);

  const subtitle = [client?.company ?? client?.name, p.address].filter(Boolean).map(esc).join(" · ");
  ctx.root.innerHTML = `
    ${header({ title: p.name, subtitle, back: { href: "#/projekte", label: "Projekte" },
      actions: `${navButton("ask", "assistant", "Assistent zu diesem Projekt fragen")}${navButton("more", "ellipsis", "Weitere Aktionen")}` })}
    <div class="page">
      <div class="grid cols-4 mb-24">
        <div class="card metric"><span class="label">Fortschritt</span>
          <span class="row">${ring(s.progress_pct, 44)}<span class="t-subhead secondary">${s.tasks_done} von ${s.tasks_total}<br>Aufgaben</span></span></div>
        <div class="card metric"><span class="label">Aktuelle Phase</span><span class="t-headline">${esc(s.current_phase ?? "Abgeschlossen")}</span>
          <span class="foot">${s.current_phase_due ? `bis ${fmtDate(s.current_phase_due)}` : ""}${s.overdue ? ` · <span class="critical">${s.overdue} überfällig</span>` : ""}</span></div>
        <div class="card metric"><span class="label">Umzug</span><span class="value">${p.move_date ? fmtDate(p.move_date, { day: "numeric", month: "short" }) : "–"}</span>
          <span class="foot">${daysToMove == null ? "Noch kein Termin" : daysToMove > 0 ? `in ${daysToMove} Tagen` : daysToMove === 0 ? "heute" : "vorbei"}</span></div>
        <a class="card metric" href="#/projekte/${id}/budget"><span class="label">Budget</span><span class="value">${eur(s.forecast)}</span>
          ${progress(budgetPct, budgetTone)}<span class="foot row">${budgetPill(s.budget_state)}<span>Budget ${eur(p.budget_total)}</span></span></a>
      </div>

      <section class="group">
        <h2 class="group-header">Fahrplan<button class="btn btn-plain" data-action="add-task">Aufgabe</button></h2>
        <ul class="list">
          ${phases.map((ph) => {
            const pt = tasksOfPhase(ph.id);
            const done = pt.filter((t) => t.done).length;
            const late = ph.status !== "erledigt" && ph.due_date && ph.due_date < isoDate();
            return `<li><details class="disclosure" ${ph.id === openPhaseId ? "open" : ""} data-phase="${ph.id}">
              <summary class="cell">
                <span class="phase-dot ${ph.status}">${ph.status === "erledigt" ? icon("check") : ph.position}</span>
                <span class="cell-text"><span class="cell-title ${ph.status === "aktiv" ? "t-headline" : ""}">${esc(ph.title)}</span>
                <span class="cell-sub">${done}/${pt.length} erledigt · ${fmtDate(ph.start_date, { day: "numeric", month: "short" })} – <span class="${late ? "critical" : ""}">${fmtDate(ph.due_date, { day: "numeric", month: "short" })}</span></span></span>
                <span class="chevron">${icon("chevronRight")}</span>
              </summary>
              <ul class="subtasks">${pt.map((t) => taskRow(t)).join("")}
                <li><button class="cell btn-plain" data-add-to-phase="${ph.id}" style="padding-left:58px">${icon("plus", "sm")} Aufgabe hinzufügen</button></li>
              </ul></details></li>`;
          }).join("")}
          ${looseTasks.length ? `<li><details class="disclosure" open><summary class="cell"><span class="phase-dot">${icon("list")}</span>
            <span class="cell-text"><span class="cell-title">Weitere Aufgaben</span></span><span class="chevron">${icon("chevronRight")}</span></summary>
            <ul class="subtasks">${looseTasks.map((t) => taskRow(t)).join("")}</ul></details></li>` : ""}
        </ul>
        ${phases.length ? "" : `<p class="group-footer">Dieses Projekt hat noch keinen Fahrplan. <button class="btn btn-plain" data-action="template">Standard-Fahrplan anlegen</button></p>`}
      </section>

      <section class="group">
        <h2 class="group-header">Projekt</h2>
        <ul class="list with-icons">
          ${navRow(`#/projekte/${id}/budget`, "euro", "var(--system-green)", "Budget", `${budgetPct} % verplant`)}
          ${navRow(`#/projekte/${id}/stueckliste`, "list", "var(--system-orange)", "Stückliste", `${nItems} Positionen`)}
          ${navRow(`#/projekte/${id}/ausschreibungen`, "tender", "var(--system-indigo)", "Ausschreibungen & Angebote", `${nTenders}`)}
          ${navRow(`#/projekte/${id}/termine`, "calendar", "var(--system-red)", "Termine & Besichtigungen", nextAppt[0] ? relDay(nextAppt[0].starts_at) : "")}
          ${navRow(`#/projekte/${id}/doku`, "journal", "var(--system-teal)", "Dokumentation", `${nLogs} Einträge`)}
          ${navRow(`#/projekte/${id}/dateien`, "photo", "var(--system-purple)", "Pläne, Fotos & Visualisierung", `${nFiles}`)}
          ${navRow(`#/projekte/${id}/umzug`, "truck", "var(--system-blue)", "Umzug", `${nRooms} Räume`)}
        </ul>
      </section>
      ${p.style || p.description ? `<section class="group"><h2 class="group-header">Konzept</h2><div class="card stack">
        ${p.style ? `<div><div class="t-footnote secondary">Stil & Materialien</div>${esc(p.style)}</div>` : ""}
        ${p.description ? `<div><div class="t-footnote secondary">Notizen</div>${esc(p.description)}</div>` : ""}
        <div class="t-footnote secondary">${[p.workplaces ? `${p.workplaces} Arbeitsplätze` : "", p.area_sqm ? `${p.area_sqm} m²` : ""].filter(Boolean).join(" · ")}</div></div></section>` : ""}
    </div>`;

  bindTasks(ctx.root, ctx.rerender);
  ctx.root.addEventListener("click", async (e) => {
    const addPhase = e.target.closest("[data-add-to-phase]");
    if (addPhase) { if (await taskSheet({ projectId: id, phaseId: addPhase.dataset.addToPhase })) ctx.rerender(); return; }
    const a = e.target.closest("[data-action]");
    if (!a) return;
    try {
      if (a.dataset.action === "add-task") { if (await taskSheet({ projectId: id })) ctx.rerender(); }
      if (a.dataset.action === "ask") location.hash = `#/assistent?projekt=${encodeURIComponent(p.name)}`;
      if (a.dataset.action === "template") { await q(db.rpc("apply_project_template", { p_project: id })); ctx.rerender(); }
      if (a.dataset.action === "more") {
        const choice = await actionSheet({ title: p.name, actions: [
          { label: "Bearbeiten", value: "edit" },
          { label: p.status === "aktiv" ? "Pausieren" : "Aktivieren", value: "toggle" },
          { label: "Als abgeschlossen markieren", value: "done" },
        ] });
        if (choice === "edit") { if (await projectSheet(p)) ctx.rerender(); }
        if (choice === "toggle") { await q(db.from("projects").update({ status: p.status === "aktiv" ? "pausiert" : "aktiv" }).eq("id", id)); ctx.rerender(); }
        if (choice === "done") {
          if (await confirmDialog({ title: "Projekt abschließen?", message: "Es erscheint dann nicht mehr in „Heute“ und im Briefing.", confirm: "Abschließen" })) {
            await q(db.from("projects").update({ status: "abgeschlossen" }).eq("id", id));
            ctx.rerender();
          }
        }
      }
    } catch (err) { errorToast(err); }
  });
  // Aufgeklappte Phase merken, ohne neu zu rendern
  ctx.root.querySelectorAll("details[data-phase]").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) history.replaceState(null, "", `#/projekte/${id}?phase=${d.dataset.phase}`);
  }));
}

function navRow(href, ic, tint, title, detailText) {
  return `<li><a class="cell" href="${href}"><span class="cell-icon" style="--tint:${tint}">${icon(ic)}</span>
    <span class="cell-text"><span class="cell-title">${esc(title)}</span></span>
    <span class="cell-detail">${esc(detailText ?? "")}</span><span class="chevron">${icon("chevronRight")}</span></a></li>`;
}

export default function (ctx) {
  return ctx.mode === "detail" ? detail(ctx) : list(ctx);
}
