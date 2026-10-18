// Dokumentation (Bautagebuch mit Fotos) und Dateien: Pläne, Fotos, Visualisierungen (Higgsfield), Desktop-Aufträge.
import { api, db, hydrateImages, q, signedUrl, uploadFile } from "../supa.js";
import { icon } from "../icons.js";
import {
  actionSheet, contentSheet, empty, errorToast, esc, fmtDate, fmtDateLong, fmtTime, formSheet, header, isoDate, navButton, toast,
} from "../ui.js";

const KINDS = { foto: "Fotos", plan: "Pläne", cad: "CAD-Dateien", visualisierung: "Visualisierungen", angebot: "Angebote", dokument: "Dokumente" };

function guessKind(file) {
  if (/\.(dwg|dxf|skp|blend|ifc|3dm|rvt|pln)$/i.test(file.name)) return "cad";
  if (/^image\//.test(file.type)) return "foto";
  if (/angebot|offer|quote/i.test(file.name)) return "angebot";
  if (/plan|grundriss|schnitt/i.test(file.name) || file.type === "application/pdf") return "plan";
  return "dokument";
}

function thumb(f) {
  const isImg = /^image\//.test(f.mime ?? "");
  return `<button class="thumb" data-file="${f.id}" aria-label="${esc(f.name)}">
    ${isImg ? `<img data-path="${esc(f.storage_path)}" alt="${esc(f.caption ?? f.name)}" loading="lazy">` : icon(f.kind === "cad" ? "cube" : "doc", "lg")}
    <span class="cap">${esc(f.caption ?? f.name)}</span></button>`;
}

async function openFile(f, rerender) {
  const url = await signedUrl(f.storage_path);
  const isImg = /^image\//.test(f.mime ?? "");
  const d = contentSheet({
    title: f.caption ?? f.name, wide: true,
    html: `${isImg ? `<img src="${url}" alt="" style="width:100%;border-radius:12px;margin-bottom:16px">` : ""}
      <ul class="list mb-16"><li><div class="cell"><span class="cell-text"><span class="cell-title">${esc(f.name)}</span>
      <span class="cell-sub">${KINDS[f.kind] ?? f.kind} · ${fmtDate(f.created_at)}${f.size ? ` · ${(f.size / 1048576).toFixed(1)} MB` : ""}</span></span></div></li></ul>
      <div class="btn-row"><a class="btn btn-filled" href="${url}" target="_blank" rel="noopener" download="${esc(f.name)}">${icon("download", "sm")}Öffnen</a>
      <button class="btn btn-destructive" data-del>Löschen</button></div>`,
  });
  d.querySelector("[data-del]").addEventListener("click", async () => {
    const { confirmDialog } = await import("../ui.js");
    if (!(await confirmDialog({ title: "Datei löschen?", confirm: "Löschen", destructive: true }))) return;
    await db.storage.from("files").remove([f.storage_path]);
    await q(db.from("files").delete().eq("id", f.id));
    d.close();
    rerender();
  });
}

// ---------------------------------------------------------------- Dokumentation

function logSheet(projectId, phases) {
  return formSheet({
    title: "Neuer Eintrag",
    confirm: "Sichern",
    values: { entry_date: isoDate() },
    sections: [
      { fields: [
        { name: "entry_date", label: "Datum", type: "date", required: true },
        { name: "phase_id", label: "Phase", type: "select", options: [["", "Keine"], ...phases.map((p) => [p.id, p.title])] },
      ] },
      { fields: [{ name: "text", label: "Was ist passiert?", type: "textarea", rows: 6, required: true, placeholder: "z. B. Trockenbau im 3. OG fertig, Elektriker beginnt Mo. Mängel: Türzarge Besprechungsraum." }] },
      { fields: [{ name: "photos", label: "Fotos", type: "file", accept: "image/*", multiple: true }], footer: "Tipp: Fotos von der Baustelle kannst du auch einfach per WhatsApp schicken – der Assistent ordnet sie dem Projekt zu." },
    ],
    onSubmit: async (v) => {
      const log = await q(db.from("logs").insert({ project_id: projectId, entry_date: v.entry_date, text: v.text, phase_id: v.phase_id || null }).select().single());
      for (const file of v.photos ?? []) await uploadFile(file, { projectId, kind: "foto", logId: log.id });
      return log;
    },
  });
}

async function journal(ctx) {
  const id = ctx.params[0];
  const [p, logs, files, phases] = await Promise.all([
    q(db.from("projects").select("id, name").eq("id", id).single()),
    q(db.from("logs").select("*, phases(title)").eq("project_id", id).order("entry_date", { ascending: false }).order("created_at", { ascending: false })),
    q(db.from("files").select("*").eq("project_id", id).not("log_id", "is", null)),
    q(db.from("phases").select("id, title").eq("project_id", id).order("position")),
  ]);
  const byDate = new Map();
  for (const l of logs) { if (!byDate.has(l.entry_date)) byDate.set(l.entry_date, []); byDate.get(l.entry_date).push(l); }

  ctx.root.innerHTML = `
    ${header({ title: "Dokumentation", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name }, actions: navButton("add", "plus", "Neuer Eintrag") })}
    <div class="page narrow">
      ${logs.length ? [...byDate.entries()].map(([day, list]) => `
        <section class="group"><h2 class="group-header small">${fmtDateLong(day)}</h2>
          <div class="stack">${list.map((l) => {
            const pics = files.filter((f) => f.log_id === l.id);
            return `<article class="card stack">
              <div class="spread"><span class="t-footnote secondary">${l.phases ? esc(l.phases.title) + " · " : ""}${fmtTime(l.created_at)}${l.source !== "app" ? ` · ${l.source === "ki" ? "Assistent" : esc(l.source)}` : ""}</span>
                <button class="icon-btn" data-del-log="${l.id}" aria-label="Eintrag löschen">${icon("trash", "sm")}</button></div>
              <div style="white-space:pre-wrap">${esc(l.text)}</div>
              ${pics.length ? `<div class="thumbs">${pics.map(thumb).join("")}</div>` : ""}
            </article>`;
          }).join("")}</div></section>`).join("")
      : empty({ icon: "journal", title: "Noch keine Einträge",
          text: "Halte Fortschritt, Besichtigungen und Mängel fest – mit Fotos. Oder schreib dem Assistenten per WhatsApp, er dokumentiert für dich.",
          action: '<button class="btn btn-filled" data-action="add">Ersten Eintrag schreiben</button>' })}
    </div>`;
  hydrateImages(ctx.root);

  ctx.root.addEventListener("click", async (e) => {
    try {
      const f = e.target.closest("[data-file]");
      if (f) return openFile(files.find((x) => x.id === f.dataset.file), ctx.rerender);
      const del = e.target.closest("[data-del-log]");
      if (del) {
        const log = logs.find((l) => l.id === del.dataset.delLog);
        await q(db.from("logs").delete().eq("id", log.id));
        ctx.rerender();
        toast("Eintrag gelöscht", { undo: async () => { const { phases: _p, ...row } = log; await q(db.from("logs").insert(row)); ctx.rerender(); } });
        return;
      }
      if (e.target.closest('[data-action="add"]') && await logSheet(id, phases)) ctx.rerender();
    } catch (err) { errorToast(err); }
  });
}

// ---------------------------------------------------------------- Dateien & Visualisierung

async function visualizeSheet(project, images) {
  return formSheet({
    title: "Visualisierung",
    confirm: "Erzeugen",
    wide: true,
    values: { prompt: "" },
    sections: [
      { html: `<div class="row mb-16"><button type="button" class="btn btn-tinted small" data-ai-prompt>${icon("sparkle", "sm")}Prompt vom Assistenten schreiben lassen</button></div>` },
      { fields: [
        { name: "room", label: "Raum / Motiv", placeholder: "z. B. Open Space mit 12 Arbeitsplätzen, Blick zum Fenster" },
        { name: "prompt", label: "Bild-Prompt (Englisch)", type: "textarea", rows: 7, required: true },
      ] },
      ...(images.length ? [{ fields: [{ name: "reference", label: "Referenzbild", type: "select",
        options: [["", "Keines"], ...images.map((f) => [f.id, f.caption ?? f.name])] }],
        footer: "Ein Screenshot aus SketchUp oder ein Foto des Bestands hilft, Raumform und Perspektive beizubehalten." }] : []),
    ],
    onSubmit: async (v) => {
      let imageUrl;
      if (v.reference) imageUrl = await signedUrl(images.find((f) => f.id === v.reference).storage_path);
      return api("/visualize", { project_id: project.id, prompt: v.prompt, image_url: imageUrl });
    },
  }).then((r) => r);
}

function bindAiPrompt(project) {
  // Der Button im Sheet erzeugt einen Prompt aus Projekt-Konzept und Raumangabe
  document.addEventListener("click", async function handler(e) {
    const b = e.target.closest("[data-ai-prompt]");
    if (!b) { if (!document.querySelector("[data-ai-prompt]")) document.removeEventListener("click", handler); return; }
    const sheet = b.closest("dialog");
    const room = sheet.querySelector('[name="room"]').value;
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> Schreibt …';
    try {
      const { text } = await api("/compose", {
        instruction: `Schreibe einen einzigen englischen Bild-Prompt (max. 120 Wörter, keine Einleitung) für eine fotorealistische Innenraum-Visualisierung eines Büros.
Projekt: ${project.name}. ${project.workplaces ? `${project.workplaces} Arbeitsplätze. ` : ""}${project.area_sqm ? `${project.area_sqm} m². ` : ""}
Konzept/Stil: ${project.style ?? "modern, hell, hochwertig"}. Motiv: ${room || "Hauptarbeitsbereich"}.
Beschreibe Möbel, Materialien, Farben, Licht (Tageslicht), Kameraperspektive (Augenhöhe, 24 mm), Architekturfotografie-Stil.`,
      });
      const ta = sheet.querySelector('[name="prompt"]');
      ta.value = text.trim();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (err) { errorToast(err); }
    b.disabled = false;
    b.innerHTML = `${icon("sparkle", "sm")}Neu schreiben lassen`;
  });
}

async function desktopJob(projectId) {
  const choice = await actionSheet({ title: "Auftrag an Programm auf deinem Rechner", actions: [
    { label: "Stückliste aus Blender holen", value: ["blender", "stueckliste_export"] },
    { label: "Rendering in Blender erstellen", value: ["blender", "render"] },
    { label: "Stückliste aus SketchUp holen", value: ["sketchup", "stueckliste_export"] },
    { label: "Szene aus SketchUp als Bild", value: ["sketchup", "render"] },
  ] });
  if (!choice) return false;
  const bridge = await q(db.from("connectors").select("id, status").eq("kind", "bridge").limit(1));
  if (!bridge.length) {
    toast("Richte zuerst die Desktop-Brücke ein (Einstellungen → Konnektoren).", { duration: 6000 });
    location.hash = "#/einstellungen/konnektoren";
    return false;
  }
  await q(db.from("bridge_jobs").insert({ target: choice[0], action: choice[1], project_id: projectId }));
  toast("Auftrag übergeben – er läuft, sobald die Desktop-Brücke aktiv ist.");
  return true;
}

async function filesView(ctx) {
  const id = ctx.params[0];
  const [p, files, vizs, jobs] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false })),
    q(db.from("visualizations").select("*").eq("project_id", id).in("status", ["laeuft", "fehler"]).order("created_at", { ascending: false }).limit(5)),
    q(db.from("bridge_jobs").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(5)),
  ]);
  const groups = Object.keys(KINDS).map((k) => [k, files.filter((f) => f.kind === k)]).filter(([, l]) => l.length);
  const images = files.filter((f) => /^image\//.test(f.mime ?? ""));
  const JOB = { offen: "wartet", laeuft: "läuft", fertig: "fertig", fehler: "Fehler" };

  ctx.root.innerHTML = `
    ${header({ title: "Pläne & Dateien", subtitle: esc(p.name), back: { href: `#/projekte/${id}`, label: p.name }, actions: navButton("upload", "upload", "Dateien hochladen") })}
    <div class="page">
      <div class="grid cols-3 mb-24">
        <button class="card metric" data-action="visualize"><span class="label">${icon("sparkle", "sm")}Visualisierung</span><span class="t-headline">Mit Higgsfield erzeugen</span><span class="foot">Fotorealistisch aus Konzept und Skizze</span></button>
        <button class="card metric" data-action="desktop"><span class="label">${icon("cube", "sm")}Blender & SketchUp</span><span class="t-headline">Auftrag senden</span><span class="foot">Stückliste oder Rendering vom Rechner</span></button>
        <button class="card metric" data-action="upload"><span class="label">${icon("upload", "sm")}Hochladen</span><span class="t-headline">Pläne, Fotos, CAD</span><span class="foot">DWG, DXF, SKP, BLEND, PDF, Bilder</span></button>
      </div>
      ${vizs.length || jobs.length ? `<section class="group"><h2 class="group-header">In Arbeit</h2><ul class="list">
        ${vizs.map((v) => `<li><div class="cell">${v.status === "laeuft" ? '<span class="spinner"></span>' : `<span class="critical">${icon("warning")}</span>`}
          <span class="cell-text"><span class="cell-title">Visualisierung ${v.status === "laeuft" ? "wird erzeugt" : "fehlgeschlagen"}</span><span class="cell-sub">${esc(v.error ?? v.prompt.slice(0, 90))}</span></span></div></li>`).join("")}
        ${jobs.map((j) => `<li><div class="cell">${j.status === "fertig" ? `<span class="positive">${icon("check")}</span>` : j.status === "fehler" ? `<span class="critical">${icon("warning")}</span>` : '<span class="spinner"></span>'}
          <span class="cell-text"><span class="cell-title">${esc(j.target[0].toUpperCase() + j.target.slice(1))}: ${j.action === "stueckliste_export" ? "Stückliste" : j.action === "render" ? "Rendering" : esc(j.action)}</span>
          <span class="cell-sub">${JOB[j.status]} · ${fmtDate(j.created_at)} ${fmtTime(j.created_at)}${j.result?.imported != null ? ` · ${j.result.imported} Positionen übernommen` : ""}${j.result?.error ? ` · ${esc(j.result.error)}` : ""}</span></span></div></li>`).join("")}
      </ul></section>` : ""}
      ${groups.length ? groups.map(([k, list]) => `<section class="group"><h2 class="group-header">${KINDS[k]}</h2><div class="thumbs">${list.map(thumb).join("")}</div></section>`).join("")
        : empty({ icon: "photo", title: "Noch keine Dateien", text: "Lade Grundrisse, CAD-Dateien, Fotos und Angebote hoch – alles an einem Ort beim Projekt.",
            action: '<button class="btn btn-filled" data-action="upload">Dateien hochladen</button>' })}
    </div>`;
  hydrateImages(ctx.root);

  // Laufende Aufträge selbstständig aktualisieren
  if (vizs.some((v) => v.status === "laeuft") || jobs.some((j) => j.status === "offen" || j.status === "laeuft")) {
    const timer = setTimeout(() => { if (document.body.contains(ctx.root)) ctx.rerender(); }, 15000);
    window.addEventListener("hashchange", () => clearTimeout(timer), { once: true });
  }

  ctx.root.addEventListener("click", async (e) => {
    try {
      const f = e.target.closest("[data-file]");
      if (f) return openFile(files.find((x) => x.id === f.dataset.file), ctx.rerender);
      const a = e.target.closest("[data-action]");
      if (!a) return;
      if (a.dataset.action === "upload") {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.onchange = async () => {
          const list = [...input.files];
          toast(`${list.length} Datei(en) werden hochgeladen …`, { duration: 2500 });
          try {
            for (const file of list) await uploadFile(file, { projectId: id, kind: guessKind(file) });
            toast(`${list.length} Datei(en) hochgeladen`);
            ctx.rerender();
          } catch (err) { errorToast(err); }
        };
        input.click();
      }
      if (a.dataset.action === "visualize") {
        bindAiPrompt(p);
        const r = await visualizeSheet(p, images);
        if (r) { toast(r.status === "fertig" ? "Visualisierung fertig" : "Visualisierung wird erzeugt – dauert meist 1–3 Minuten"); ctx.rerender(); }
      }
      if (a.dataset.action === "desktop" && await desktopJob(id)) ctx.rerender();
    } catch (err) { errorToast(err); }
  });
}

export default function (ctx) {
  return ctx.mode === "files" ? filesView(ctx) : journal(ctx);
}
