// Zeiterfassung je Projekt: Stoppuhr (Start/Stopp), nachträglich buchen, Summen je Phase, Wert nach Stundensatz, CSV-Export.
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import { downloadFile, empty, errorToast, esc, eur, fmtDate, formSheet, header, isoDate, navButton, toast } from "../ui.js";

export const hours = (min) => `${(Number(min) / 60).toLocaleString("de-AT", { maximumFractionDigits: 1 })} h`;
export const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Beendet laufende Stoppuhren und bucht die Minuten. */
export async function stopTimers() {
  const running = await q(db.from("time_entries").select("id, started_at").not("started_at", "is", null));
  for (const r of running) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000));
    await q(db.from("time_entries").update({ minutes, started_at: null }).eq("id", r.id));
  }
  return running.length;
}

export async function startTimer(projectId, phaseId = null) {
  await stopTimers();
  await q(db.from("time_entries").insert({ project_id: projectId, phase_id: phaseId, entry_date: isoDate(), started_at: new Date().toISOString() }));
}

async function entrySheet(projectId, phases, entry = null) {
  return formSheet({
    title: entry ? "Zeiteintrag" : "Zeit buchen",
    confirm: entry ? "Sichern" : "Buchen",
    values: entry ? { ...entry, hours: entry.minutes / 60, phase_id: entry.phase_id ?? "" } : { entry_date: isoDate(), phase_id: phases.find((p) => p.status === "aktiv")?.id ?? "" },
    sections: [
      { fields: [
        { name: "entry_date", label: "Datum", type: "date", required: true },
        { name: "hours", label: "Dauer", type: "number", suffix: "h", required: true, placeholder: "z. B. 1,5" },
        { name: "phase_id", label: "Phase", type: "select", options: [["", "Ohne Phase"], ...phases.map((p) => [p.id, p.title])] },
      ] },
      { fields: [{ name: "note", label: "Notiz", placeholder: "z. B. Möblierungsplan Variante B" }],
        footer: "Schneller per WhatsApp: „2 h Planung Huber“." },
    ],
    destructive: entry ? { label: "Eintrag löschen", confirmTitle: "Zeiteintrag löschen?", onConfirm: () => q(db.from("time_entries").delete().eq("id", entry.id)) } : null,
    onSubmit: (v) => {
      if (!(v.hours > 0)) throw new Error("Bitte eine Dauer größer 0 eingeben.");
      const row = { project_id: projectId, entry_date: v.entry_date, minutes: Math.round(v.hours * 60), phase_id: v.phase_id || null, note: v.note };
      return entry ? q(db.from("time_entries").update(row).eq("id", entry.id)) : q(db.from("time_entries").insert(row));
    },
  });
}

export default async function time(ctx) {
  const id = ctx.params[0];
  const [p, phases, entries, profile, runningAny] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("phases").select("id, title, status").eq("project_id", id).order("position")),
    q(db.from("time_entries").select("*").eq("project_id", id).order("entry_date", { ascending: false }).order("created_at", { ascending: false })),
    q(db.from("profiles").select("hourly_rate").maybeSingle()),
    q(db.from("time_entries").select("id, project_id, started_at, projects(name)").not("started_at", "is", null).limit(1)),
  ]);
  const rate = Number(profile?.hourly_rate ?? 0);
  const booked = entries.filter((e) => e.minutes != null && !e.started_at);
  const running = entries.find((e) => e.started_at);
  const otherRunning = !running && runningAny[0];
  const total = booked.reduce((s, e) => s + e.minutes, 0);
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); })();
  const week = booked.filter((e) => e.entry_date >= weekStart).reduce((s, e) => s + e.minutes, 0);
  const phaseName = (pid) => phases.find((x) => x.id === pid)?.title ?? "Ohne Phase";
  const byPhase = {};
  for (const e of booked) byPhase[phaseName(e.phase_id)] = (byPhase[phaseName(e.phase_id)] ?? 0) + e.minutes;
  const byDay = [];
  for (const e of booked) {
    const g = byDay.find((x) => x.date === e.entry_date);
    if (g) g.items.push(e); else byDay.push({ date: e.entry_date, items: [e] });
  }

  ctx.root.innerHTML = `
    ${header({ title: "Zeiterfassung", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name },
      actions: `${booked.length ? navButton("csv", "download", "Als CSV exportieren") : ""}${navButton("add", "plus", "Zeit buchen")}` })}
    <div class="page">
      <div class="card timer-card mb-24">
        <div class="timer-face">
          <span class="t-footnote secondary">${running ? `Läuft seit ${new Date(running.started_at).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · ${esc(phaseName(running.phase_id))}` : otherRunning ? `Stoppuhr läuft gerade für „${esc(otherRunning.projects?.name ?? "")}“` : "Stoppuhr"}</span>
          <span class="timer-value" data-clock>${running ? clock(Date.now() - new Date(running.started_at).getTime()) : "0:00:00"}</span>
        </div>
        ${running
          ? `<button class="btn btn-destructive timer-btn" data-action="stop">${icon("stop", "sm")}Stopp</button>`
          : `<button class="btn btn-filled timer-btn" data-action="start">${icon("play", "sm")}Start</button>`}
      </div>

      <div class="grid cols-3 mb-24">
        <div class="card metric"><span class="label">Gesamt</span><span class="value">${hours(total)}</span></div>
        <div class="card metric"><span class="label">Diese Woche</span><span class="value">${hours(week)}</span></div>
        <div class="card metric"><span class="label">Wert</span><span class="value">${rate ? eur(total / 60 * rate) : "–"}</span>
          <span class="foot">${rate ? `${eur(rate)} pro Stunde` : '<a href="#/einstellungen">Stundensatz festlegen</a>'}</span></div>
      </div>

      ${booked.length ? `
        <section class="group"><h2 class="group-header">Nach Phase</h2><ul class="list">
          ${Object.entries(byPhase).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><div class="cell"><span class="cell-text"><span class="cell-title">${esc(k)}</span></span>
            <span class="cell-detail">${hours(v)}${rate ? ` · ${eur(v / 60 * rate)}` : ""}</span></div></li>`).join("")}
        </ul></section>
        ${byDay.map((g) => `<section class="group"><h2 class="group-header small">${fmtDate(g.date)}<span class="secondary">${hours(g.items.reduce((s, e) => s + e.minutes, 0))}</span></h2><ul class="list">
          ${g.items.map((e) => `<li><button class="cell" data-entry="${e.id}"><span class="cell-text"><span class="cell-title">${esc(e.note || phaseName(e.phase_id))}</span>
            ${e.note ? `<span class="cell-sub">${esc(phaseName(e.phase_id))}</span>` : ""}</span><span class="cell-detail">${hours(e.minutes)}</span>
            <span class="chevron">${icon("chevronRight")}</span></button></li>`).join("")}</ul></section>`).join("")}`
      : running ? "" : empty({ icon: "timer", title: "Noch keine Zeiten", text: "Starte die Stoppuhr oder buche Stunden nachträglich. Per WhatsApp reicht „2 h Planung Huber“." })}
    </div>`;

  if (running) {
    const el = ctx.root.querySelector("[data-clock]");
    const timer = setInterval(() => {
      if (!el.isConnected) return clearInterval(timer);
      el.textContent = clock(Date.now() - new Date(running.started_at).getTime());
    }, 1000);
  }

  ctx.root.addEventListener("click", async (e) => {
    try {
      const en = e.target.closest("[data-entry]");
      if (en) { if (await entrySheet(id, phases, booked.find((x) => x.id === en.dataset.entry))) ctx.rerender(); return; }
      const a = e.target.closest("[data-action]");
      if (!a) return;
      if (a.dataset.action === "add" && await entrySheet(id, phases)) ctx.rerender();
      if (a.dataset.action === "start") {
        await startTimer(id, phases.find((x) => x.status === "aktiv")?.id ?? null);
        if (otherRunning) toast(`Stoppuhr für „${otherRunning.projects?.name ?? ""}“ gestoppt und gebucht`);
        ctx.rerender();
      }
      if (a.dataset.action === "stop") {
        const min = Math.max(1, Math.round((Date.now() - new Date(running.started_at).getTime()) / 60000));
        await stopTimers();
        toast(`${hours(min)} gebucht`, { undo: async () => { await q(db.from("time_entries").update({ minutes: null, started_at: running.started_at }).eq("id", running.id)); ctx.rerender(); } });
        ctx.rerender();
      }
      if (a.dataset.action === "csv") {
        const lines = [["Datum", "Phase", "Notiz", "Stunden", "Wert EUR"].join(";"),
          ...booked.map((x) => [x.entry_date, phaseName(x.phase_id), (x.note ?? "").replace(/;/g, ","), (x.minutes / 60).toFixed(2).replace(".", ","),
            rate ? (x.minutes / 60 * rate).toFixed(2).replace(".", ",") : ""].join(";"))];
        downloadFile(`Zeiten ${p.name}.csv`, "﻿" + lines.join("\n"));
      }
    } catch (err) { errorToast(err); }
  });
}
