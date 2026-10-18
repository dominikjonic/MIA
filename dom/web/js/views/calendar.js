// Kalender mit Ampel: gleicht Termine, Aufgaben, Erinnerungen, Phasenenden, Angebotsfristen, Umzüge und
// Google Kalender ab. Rot = überfällig oder Konflikt, Gelb = offen, Grün = erledigt bzw. im Plan.
import { api, db, q } from "../supa.js";
import { icon } from "../icons.js";
import { addDays, errorToast, esc, fmtDate, fmtDateLong, fmtTime, header, isoDate, navButton, segmented } from "../ui.js";
import { bindTasks, taskRow } from "./projects.js";
import { appointmentSheet, KIND } from "./appointments.js";

export const AMPEL = {
  rot: { label: "Überfällig oder Konflikt", color: "var(--critical)", icon: "warning" },
  gelb: { label: "Offen", color: "var(--system-yellow)", icon: "clock" },
  gruen: { label: "Erledigt / im Plan", color: "var(--positive)", icon: "check" },
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Lädt alle Einträge im Zeitraum und bewertet jeden Tag mit einer Ampelfarbe. */
export async function loadDays(from, to) {
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();
  const [appts, tasks, reminders, phases, tenders, projects, google] = await Promise.all([
    q(db.from("appointments").select("*, projects(name, status)").gte("starts_at", fromIso).lte("starts_at", toIso).order("starts_at")),
    q(db.from("tasks").select("*, projects(name, status)").gte("due_date", from).lte("due_date", to).order("position")),
    q(db.from("reminders").select("*, projects(name)").gte("remind_at", fromIso).lte("remind_at", toIso)),
    q(db.from("phases").select("id, title, due_date, status, project_id, projects(name, status)").gte("due_date", from).lte("due_date", to)),
    q(db.from("tenders").select("id, title, deadline, status, project_id, projects(name, status)").gte("deadline", from).lte("deadline", to)),
    q(db.from("projects").select("id, name, move_date, end_date, status").eq("status", "aktiv")),
    googleEvents(fromIso, toIso),
  ]);
  const offerCounts = new Map();
  if (tenders.length) {
    const offers = await q(db.from("offers").select("tender_id").in("tender_id", tenders.map((t) => t.id)));
    offers.forEach((o) => offerCounts.set(o.tender_id, (offerCounts.get(o.tender_id) ?? 0) + 1));
  }
  const activeOrNone = (x) => !x.projects || x.projects.status === "aktiv";
  const today = isoDate();
  const days = new Map();
  const get = (d) => {
    if (!days.has(d)) days.set(d, { date: d, appts: [], tasks: [], reminders: [], deadlines: [], google: [], status: null, problems: [] });
    return days.get(d);
  };

  appts.filter(activeOrNone).forEach((a) => get(isoDate(new Date(a.starts_at))).appts.push(a));
  tasks.filter(activeOrNone).forEach((t) => get(t.due_date).tasks.push(t));
  reminders.forEach((r) => get(isoDate(new Date(r.remind_at))).reminders.push(r));
  phases.filter(activeOrNone).forEach((p) => get(p.due_date).deadlines.push({ kind: "phase", short: `◆ ${p.title}`, title: `Phasenende: ${p.title}`, sub: p.projects?.name, done: p.status === "erledigt", href: `#/projekte/${p.project_id}?phase=${p.id}` }));
  tenders.filter(activeOrNone).forEach((t) => get(t.deadline).deadlines.push({ kind: "tender", short: `⚑ ${t.title}`, title: `Angebotsfrist: ${t.title}`, sub: `${t.projects?.name ?? ""} · ${offerCounts.get(t.id) ?? 0} Angebote`, done: t.status === "vergeben" || (offerCounts.get(t.id) ?? 0) > 0, href: `#/projekte/${t.project_id}/ausschreibungen/${t.id}` }));
  projects.forEach((p) => {
    if (p.move_date >= from && p.move_date <= to) get(p.move_date).deadlines.push({ kind: "move", title: `Umzug: ${p.name}`, done: p.move_date < today, href: `#/projekte/${p.id}/umzug` });
    if (p.end_date && p.end_date >= from && p.end_date <= to) get(p.end_date).deadlines.push({ kind: "end", title: `Übergabe: ${p.name}`, done: p.end_date < today, href: `#/projekte/${p.id}` });
  });
  google.forEach((g) => get(g.start.length > 10 ? isoDate(new Date(g.start)) : g.start.slice(0, 10)).google.push(g));

  for (const day of days.values()) {
    const past = day.date < today;
    const openTasks = day.tasks.filter((t) => !t.done);
    const openDeadlines = day.deadlines.filter((d) => !d.done);
    if (past && openTasks.length) day.problems.push(`${openTasks.length} Aufgabe${openTasks.length > 1 ? "n" : ""} überfällig`);
    if (past && openDeadlines.length) day.problems.push(...openDeadlines.map((d) => `${d.title} verpasst`));
    // Terminkonflikte: überlappende Termine (auch mit Google Kalender)
    const slots = [
      ...day.appts.map((a) => ({ t: a.title, s: new Date(a.starts_at), e: new Date(a.ends_at ?? new Date(a.starts_at).getTime() + 3600000) })),
      ...day.google.filter((g) => g.start.length > 10 && !day.appts.some((a) => a.google_event_id && a.title && g.title?.startsWith(a.title)))
        .map((g) => ({ t: g.title, s: new Date(g.start), e: new Date(g.end ?? new Date(g.start).getTime() + 3600000) })),
    ].sort((x, y) => x.s - y.s);
    for (let i = 1; i < slots.length; i++) if (slots[i].s < slots[i - 1].e) day.problems.push(`Konflikt: ${slots[i - 1].t} / ${slots[i].t}`);
    const hasAnything = day.appts.length || day.tasks.length || day.deadlines.length || day.reminders.length || day.google.length;
    day.status = day.problems.length ? "rot" : (!past && (openTasks.length || openDeadlines.length || day.reminders.some((r) => !r.sent_at))) ? "gelb" : hasAnything ? "gruen" : null;
    day.count = day.appts.length + openTasks.length + openDeadlines.length + day.google.length;
  }
  return days;
}

async function googleEvents(from, to) {
  try {
    const rows = await q(db.from("connectors").select("status").eq("kind", "google").limit(1));
    if (rows[0]?.status !== "verbunden") return [];
    return (await api("/google/events", { from, to })).events ?? [];
  } catch { return []; }
}

export function ampelDot(status, count = null) {
  if (!status) return "";
  const a = AMPEL[status];
  return `<span class="ampel ampel-${status}" title="${a.label}" aria-label="${a.label}${count ? `, ${count} Einträge` : ""}">${count ?? ""}</span>`;
}

// ---------------------------------------------------------------- Tagesansicht (Liste unter dem Kalender)

function dayAgenda(day) {
  if (!day || !day.status) {
    return `<div class="card t-subhead secondary">Keine Einträge an diesem Tag. <button class="btn btn-plain" data-action="add">Termin anlegen</button></div>`;
  }
  const a = AMPEL[day.status];
  return `
    <div class="card row mb-16 ampel-banner" style="--c:${a.color}">${ampelDot(day.status)}<span class="cell-text"><span class="t-headline">${a.label}</span>
      ${day.problems.length ? `<span class="cell-sub critical">${day.problems.map(esc).join(" · ")}</span>` : ""}</span></div>
    ${day.appts.length || day.google.length ? `<section class="group"><h3 class="group-header small">Termine</h3><ul class="list with-icons">
      ${day.appts.map((x) => `<li><button class="cell" data-appt="${x.id}"><span class="cell-icon" style="--tint:${KIND[x.kind]?.tint}">${icon(KIND[x.kind]?.icon ?? "calendar")}</span>
        <span class="cell-text"><span class="cell-title">${esc(x.title)}</span><span class="cell-sub">${[x.projects?.name, x.location].filter(Boolean).map(esc).join(" · ")}</span></span>
        <span class="cell-detail t-headline" style="color:var(--label)">${fmtTime(x.starts_at)}</span></button></li>`).join("")}
      ${day.google.map((g) => `<li><div class="cell"><span class="cell-icon" style="--tint:var(--system-gray)">${icon("calendar")}</span>
        <span class="cell-text"><span class="cell-title">${esc(g.title ?? "Termin")}</span><span class="cell-sub">Google Kalender${g.location ? ` · ${esc(g.location)}` : ""}</span></span>
        <span class="cell-detail">${g.start.length > 10 ? fmtTime(g.start) : "ganztägig"}</span></div></li>`).join("")}</ul></section>` : ""}
    ${day.deadlines.length ? `<section class="group"><h3 class="group-header small">Fristen</h3><ul class="list">
      ${day.deadlines.map((d) => `<li><a class="cell" href="${d.href}">${ampelDot(d.done ? "gruen" : day.date < isoDate() ? "rot" : "gelb")}
        <span class="cell-text"><span class="cell-title">${esc(d.title)}</span>${d.sub ? `<span class="cell-sub">${esc(d.sub)}</span>` : ""}</span><span class="chevron">${icon("chevronRight")}</span></a></li>`).join("")}</ul></section>` : ""}
    ${day.tasks.length ? `<section class="group"><h3 class="group-header small">Aufgaben</h3><ul class="list">${day.tasks.map((t) => taskRow(t, { showProject: true })).join("")}</ul></section>` : ""}
    ${day.reminders.length ? `<section class="group"><h3 class="group-header small">Erinnerungen</h3><ul class="list">${day.reminders.map((r) => `<li><div class="cell">${icon("bell")}
      <span class="cell-text"><span class="cell-title">${esc(r.text)}</span><span class="cell-sub">${fmtTime(r.remind_at)}${r.sent_at ? " · gesendet" : ""}</span></span></div></li>`).join("")}</ul></section>` : ""}`;
}

// ---------------------------------------------------------------- Monatsansicht

export default async function calendar(ctx) {
  if (ctx.query.get("ansicht") === "liste") {
    const { default: list } = await import("./appointments.js");
    await list(ctx);
    ctx.root.querySelector(".page")?.insertAdjacentHTML("afterbegin", segmented("ansicht", [["monat", "Monat"], ["liste", "Liste"]], "liste"));
    ctx.root.querySelector('[data-seg="ansicht"]')?.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.value === "monat") location.hash = "#/termine";
    });
    return;
  }
  const today = isoDate();
  const selected = ctx.query.get("tag") ?? today;
  const month = ctx.query.get("monat") ?? selected.slice(0, 7);
  const first = new Date(`${month}-01T12:00:00`);
  const gridStart = addDays(`${month}-01`, -((first.getDay() + 6) % 7));
  const gridEnd = addDays(gridStart, 41);
  const days = await loadDays(gridStart, gridEnd);
  const monthName = new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(first);
  const shift = (n) => { const d = new Date(first); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const go = (params) => { location.hash = `#/termine?${new URLSearchParams(params)}`; };

  const stats = { rot: 0, gelb: 0, gruen: 0 };
  for (const d of days.values()) if (d.status && d.date.startsWith(month)) stats[d.status]++;

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const day = days.get(date);
    const preview = day ? [
      ...day.appts.map((a) => ({ t: `${fmtTime(a.starts_at)} ${a.title}`, c: KIND[a.kind]?.tint })),
      ...day.deadlines.filter((d) => !d.done).map((d) => ({ t: d.short ?? d.title, c: "var(--system-orange)" })),
      ...day.google.map((g) => ({ t: `${g.start.length > 10 ? fmtTime(g.start) + " " : ""}${g.title ?? ""}`, c: "var(--system-gray)" })),
    ] : [];
    cells.push(`<button class="cal-day ${date.slice(0, 7) !== month ? "other" : ""} ${date === today ? "today" : ""} ${date === selected ? "selected" : ""}" data-day="${date}"
      aria-label="${fmtDateLong(date)}${day?.status ? `, ${AMPEL[day.status].label}` : ""}" aria-pressed="${date === selected}">
      <span class="cal-num">${Number(date.slice(8))}</span>
      ${day?.status ? ampelDot(day.status, day.count || null) : ""}
      <span class="cal-preview">${preview.slice(0, 3).map((p) => `<span style="--c:${p.c}">${esc(p.t)}</span>`).join("")}${preview.length > 3 ? `<span class="more">+${preview.length - 3}</span>` : ""}</span>
    </button>`);
  }

  ctx.root.innerHTML = `
    ${header({ title: "Kalender", actions: navButton("add", "plus", "Neuer Termin") })}
    <div class="page">
      <div class="spread">${segmented("ansicht", [["monat", "Monat"], ["liste", "Liste"]], "monat")}
        <div class="row mb-16 t-footnote secondary">${["rot", "gelb", "gruen"].map((s) => `<span class="row" style="gap:6px">${ampelDot(s)}${AMPEL[s].label}${stats[s] ? ` (${stats[s]})` : ""}</span>`).join("")}</div></div>
      <div class="cal-layout">
        <section class="card cal-card">
          <div class="spread cal-head">
            <h2 class="t-title2" style="text-transform:capitalize">${esc(monthName)}</h2>
            <div class="row" style="gap:4px">
              <button class="icon-btn" data-month="${shift(-1)}" aria-label="Vorheriger Monat">${icon("chevronLeft")}</button>
              <button class="btn btn-gray small" data-action="today">Heute</button>
              <button class="icon-btn" data-month="${shift(1)}" aria-label="Nächster Monat">${icon("chevronRight")}</button>
            </div>
          </div>
          <div class="cal-grid" role="grid">${WEEKDAYS.map((w) => `<span class="cal-wd">${w}</span>`).join("")}${cells.join("")}</div>
        </section>
        <section class="cal-agenda">
          <h2 class="group-header">${fmtDateLong(selected)}</h2>
          <div data-agenda>${dayAgenda(days.get(selected))}</div>
        </section>
      </div>
      <p class="group-footer">Abonniere den DOM-Kalender in Apple Kalender oder Outlook unter <a href="#/einstellungen">Einstellungen → Kalender-Abo</a>, dann siehst du alle Termine und Fristen auch dort.</p>
    </div>`;

  bindTasks(ctx.root, ctx.rerender);
  ctx.root.addEventListener("click", async (e) => {
    const seg = e.target.closest("[data-seg] button");
    if (seg) { if (seg.dataset.value === "liste") location.hash = "#/termine?ansicht=liste"; return; }
    const dayBtn = e.target.closest("[data-day]");
    if (dayBtn) {
      const d = dayBtn.dataset.day;
      if (d.slice(0, 7) !== month) return go({ monat: d.slice(0, 7), tag: d });
      history.replaceState(null, "", `#/termine?monat=${month}&tag=${d}`);
      ctx.root.querySelectorAll("[data-day]").forEach((b) => { b.classList.toggle("selected", b === dayBtn); b.setAttribute("aria-pressed", b === dayBtn); });
      ctx.root.querySelector(".cal-agenda .group-header").textContent = fmtDateLong(d);
      ctx.root.querySelector("[data-agenda]").innerHTML = dayAgenda(days.get(d));
      if (window.innerWidth < 900) ctx.root.querySelector(".cal-agenda").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const m = e.target.closest("[data-month]");
    if (m) return go({ monat: m.dataset.month, tag: `${m.dataset.month}-01` });
    try {
      const appt = e.target.closest("[data-appt]");
      if (appt) {
        const sel = new URLSearchParams(location.hash.split("?")[1] ?? "").get("tag") ?? selected;
        const a = days.get(sel)?.appts.find((x) => x.id === appt.dataset.appt);
        if (a && await appointmentSheet({ appt: a })) ctx.rerender();
        return;
      }
      const a = e.target.closest("[data-action]");
      if (a?.dataset.action === "today") return go({ monat: today.slice(0, 7), tag: today });
      if (a?.dataset.action === "add") {
        const sel = new URLSearchParams(location.hash.split("?")[1] ?? "").get("tag") ?? selected;
        if (await appointmentSheet({ startDate: sel })) ctx.rerender();
      }
    } catch (err) { errorToast(err); }
  });
}

/** Kompakte 7-Tage-Ampel für „Heute“. */
export async function weekStrip() {
  const start = isoDate();
  const days = await loadDays(start, addDays(start, 6));
  return `<div class="week-strip">${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const day = days.get(d);
    return `<a class="week-day ${i === 0 ? "today" : ""}" href="#/termine?tag=${d}" aria-label="${fmtDateLong(d)}${day?.status ? `: ${AMPEL[day.status].label}` : ""}">
      <span class="t-caption secondary">${i === 0 ? "Heute" : fmtDate(d, { weekday: "short" })}</span>
      <span class="cal-num">${Number(d.slice(8))}</span>
      ${day?.status ? ampelDot(day.status, day.count || null) : '<span class="ampel ampel-leer"></span>'}</a>`;
  }).join("")}</div>`;
}

