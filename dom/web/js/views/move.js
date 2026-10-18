// Umzugskoordination: Raumzuordnung alt → neu, Personen, Kisten, IT, farbige Etiketten zum Drucken.
import { db, q } from "../supa.js";
import { icon } from "../icons.js";
import { contentSheet, empty, errorToast, esc, fmtDateLong, formSheet, header, navButton, num, toast } from "../ui.js";
import { draftWithAI, mailSheet } from "./mail.js";

const COLORS = {
  blau: "#0a84ff", gruen: "#30d158", rot: "#ff3b30", orange: "#ff9500", gelb: "#ffcc00", lila: "#af52de", grau: "#8e8e93", tuerkis: "#30b0c7",
};
const COLOR_LABEL = { blau: "Blau", gruen: "Grün", rot: "Rot", orange: "Orange", gelb: "Gelb", lila: "Lila", grau: "Grau", tuerkis: "Türkis" };

function roomSheet(projectId, room = null) {
  return formSheet({
    title: room ? "Raum" : "Raum hinzufügen",
    confirm: room ? "Sichern" : "Hinzufügen",
    values: room ?? { persons: 0, crates: 0, label_color: "blau" },
    sections: [
      { fields: [
        { name: "to_room", label: "Neuer Raum", required: true, placeholder: "z. B. 3.12 Buchhaltung" },
        { name: "from_room", label: "Bisher", placeholder: "z. B. 2.04" },
        { name: "department", label: "Abteilung" },
        { name: "label_color", label: "Etikettfarbe", type: "select", options: Object.entries(COLOR_LABEL) },
      ] },
      { fields: [
        { name: "persons", label: "Personen", type: "number" },
        { name: "crates", label: "Umzugskisten", type: "number" },
      ] },
      { fields: [
        { name: "furniture", label: "Möbel (Mitnahme/neu)", type: "textarea", rows: 2 },
        { name: "it_notes", label: "IT & Technik", type: "textarea", rows: 2, placeholder: "z. B. 4 PCs, 1 Drucker, Telefonanlage" },
      ] },
    ],
    destructive: room ? { label: "Raum löschen", confirmTitle: "Raum löschen?", onConfirm: () => q(db.from("move_rooms").delete().eq("id", room.id)) } : null,
    onSubmit: (v) => {
      const row = { ...v, persons: v.persons ?? 0, crates: v.crates ?? 0, project_id: projectId };
      return room ? q(db.from("move_rooms").update(row).eq("id", room.id)) : q(db.from("move_rooms").insert(row));
    },
  });
}

function labelsSheet(project, rooms) {
  const html = `<div class="no-print row mb-16"><button class="btn btn-filled" onclick="window.print()">${icon("print", "sm")}Drucken</button>
    <span class="t-footnote secondary">A4, je Raum ein Etikett – auf Kisten, Möbel und Türen kleben.</span></div>
    <div class="labels">${rooms.map((r) => `<div class="label-card" style="--c:${COLORS[r.label_color] ?? COLORS.blau}">
      <div class="room">${esc(r.to_room)}</div>
      <div class="meta">${r.department ? `<b>${esc(r.department)}</b><br>` : ""}${esc(project.name)}${r.from_room ? `<br>von ${esc(r.from_room)}` : ""}
      ${project.move_date ? `<br>Umzug ${fmtDateLong(project.move_date)}` : ""}</div></div>`).join("")}</div>`;
  const d = contentSheet({ title: "Umzugsetiketten", html, wide: true });
  // Beim Drucken nur die Etiketten zeigen
  const style = document.createElement("style");
  style.textContent = "@media print { body > *:not(dialog) { display:none !important } dialog.sheet { position:static; width:auto; max-height:none; box-shadow:none } .sheet-bar,.grabber { display:none } }";
  d.appendChild(style);
}

export default async function move(ctx) {
  const id = ctx.params[0];
  const [p, rooms] = await Promise.all([
    q(db.from("projects").select("*").eq("id", id).single()),
    q(db.from("move_rooms").select("*").eq("project_id", id).order("position").order("to_room")),
  ]);
  const persons = rooms.reduce((s, r) => s + Number(r.persons), 0);
  const crates = rooms.reduce((s, r) => s + Number(r.crates), 0);

  ctx.root.innerHTML = `
    ${header({ title: "Umzug", subtitle: `${esc(p.name)}${p.move_date ? ` · ${fmtDateLong(p.move_date)}` : ""}`,
      back: { href: `#/projekte/${id}`, label: p.name }, actions: navButton("add", "plus", "Raum hinzufügen") })}
    <div class="page">
      ${rooms.length ? `
        <div class="grid cols-3 mb-24">
          <div class="card metric"><span class="label">Räume</span><span class="value">${rooms.length}</span></div>
          <div class="card metric"><span class="label">Personen</span><span class="value">${num(persons)}</span></div>
          <div class="card metric"><span class="label">Umzugskisten</span><span class="value">${num(crates)}</span><span class="foot">ca. ${Math.ceil(crates / 50) || 0} LKW-Ladungen à 50 Kisten</span></div>
        </div>
        <div class="row mb-16"><button class="btn btn-tinted small" data-action="labels">${icon("tag", "sm")}Etiketten drucken</button>
          <button class="btn btn-gray small" data-action="info-mail">${icon("mail", "sm")}Umzugsinfo an Mitarbeiter</button>
          <button class="btn btn-gray small" data-action="mover-mail">${icon("truck", "sm")}Anfrage an Spedition</button></div>
        <section class="group"><ul class="list">${rooms.map((r) => `<li><button class="cell" data-room="${r.id}">
          <span class="cell-icon" style="--tint:${COLORS[r.label_color] ?? COLORS.blau}">${icon("tag")}</span>
          <span class="cell-text"><span class="cell-title">${esc(r.to_room)}${r.department ? ` · ${esc(r.department)}` : ""}</span>
          <span class="cell-sub">${r.from_room ? `von ${esc(r.from_room)} · ` : ""}${r.persons} Pers. · ${r.crates} Kisten${r.it_notes ? ` · IT: ${esc(r.it_notes)}` : ""}</span></span>
          <span class="chevron">${icon("chevronRight")}</span></button></li>`).join("")}</ul></section>`
      : empty({ icon: "truck", title: "Noch kein Umzugsplan",
          text: "Ordne jedem neuen Raum Abteilung, Personen, Kisten und IT zu. DOM druckt farbige Etiketten und formuliert die Infos für Mitarbeiter und Spedition.",
          action: '<button class="btn btn-filled" data-action="add">Ersten Raum anlegen</button>' })}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    try {
      const r = e.target.closest("[data-room]");
      if (r && await roomSheet(id, rooms.find((x) => x.id === r.dataset.room))) return ctx.rerender();
      const a = e.target.closest("[data-action]");
      if (!a) return;
      if (a.dataset.action === "add" && await roomSheet(id)) ctx.rerender();
      if (a.dataset.action === "labels") labelsSheet(p, rooms);
      const roomList = rooms.map((x) => `${x.to_room}${x.department ? ` (${x.department})` : ""}: ${x.persons} Personen, ${x.crates} Kisten${x.from_room ? `, bisher ${x.from_room}` : ""}`).join("\n");
      if (a.dataset.action === "info-mail") {
        toast("Der Assistent formuliert die E-Mail …", { duration: 3000 });
        const m = await draftWithAI(`Schreibe eine freundliche Umzugsinformation an alle Mitarbeiter von „${p.name}“. Neuer Standort: ${p.address ?? "(Adresse)"}. Umzugstermin: ${p.move_date ? fmtDateLong(p.move_date) : "(Termin)"}.
Inhalt: Kisten packen und mit dem farbigen Raum-Etikett bekleben, Schreibtisch am Vortag leeren, IT wird vom Team ab- und aufgebaut, persönliche Wertsachen selbst transportieren. Raumzuordnung:\n${roomList}`);
        await mailSheet({ subject: m.subject, body: m.body, title: "Umzugsinfo" });
      }
      if (a.dataset.action === "mover-mail") {
        toast("Der Assistent formuliert die E-Mail …", { duration: 3000 });
        const m = await draftWithAI(`Schreibe eine Angebotsanfrage an eine Umzugsspedition für den Büroumzug „${p.name}“ nach ${p.address ?? "(Adresse)"} am ${p.move_date ? fmtDateLong(p.move_date) : "(Termin)"}.
Umfang: ${rooms.length} Räume, ${persons} Arbeitsplätze, ca. ${crates} Umzugskisten, Möbelmontage/-demontage nach Bedarf, IT-Transport. Bitte um Besichtigungstermin und Festpreisangebot. Raumliste:\n${roomList}`);
        await mailSheet({ subject: m.subject, body: m.body, title: "Anfrage Spedition" });
      }
    } catch (err) { errorToast(err); }
  });
}
