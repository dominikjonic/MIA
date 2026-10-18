// Projektvorlagen: mitgelieferte Varianten und eigene Vorlagen (aus einem bestehenden Projekt gespeichert).
// Format wie in apply_project_template: {"phases":[{"title","w","tasks":[]}], "cats":[[name, prozent]]}
import { db, q } from "./supa.js";

export const BUILTIN = [
  { id: "", name: "Standard (13 Phasen)", template: null, phases: 13 },
  {
    id: "builtin:umzug", name: "Nur Umzug",
    template: {
      phases: [
        { title: "Briefing & Bestandsaufnahme", w: 2, tasks: ["Briefing-Gespräch führen", "Bestand und Mengen aufnehmen", "Budgetrahmen klären"] },
        { title: "Umzugsplanung", w: 3, tasks: ["Raumzuordnung erstellen", "Umzugsplan erstellen", "IT-Abbau und -Aufbau abstimmen"] },
        { title: "Angebote Spedition", w: 3, tasks: ["Anfragen an Speditionen senden", "Besichtigungstermine", "Angebote vergleichen", "Spedition beauftragen"] },
        { title: "Vorbereitung", w: 3, tasks: ["Mitarbeiter informieren", "Umzugsetiketten drucken", "Kisten liefern lassen", "Halteverbot beantragen"] },
        { title: "Umzug", w: 2, tasks: ["Umzug begleiten", "IT-Inbetriebnahme prüfen"] },
        { title: "Nacharbeiten & Abnahme", w: 3, tasks: ["Mängelliste führen", "Abnahme mit Kunde", "Rechnungen prüfen"] },
      ],
      cats: [["Spedition", 60], ["IT-Umzug", 20], ["Material", 10], ["Reserve", 10]],
    },
  },
  {
    id: "builtin:klein", name: "Kleines Büro",
    template: {
      phases: [
        { title: "Briefing & Naturmaß", w: 3, tasks: ["Briefing-Gespräch führen", "Naturmaß vor Ort nehmen", "Bestand fotografieren"] },
        { title: "Konzept & Möblierungsplan", w: 5, tasks: ["Möblierungsplan erstellen", "Möbel auswählen", "Freigabe Kunde einholen"] },
        { title: "Angebote & Bestellung", w: 4, tasks: ["Angebote einholen", "Angebote vergleichen", "Aufträge erteilen"] },
        { title: "Lieferung & Montage", w: 4, tasks: ["Liefertermine bestätigen", "Montage begleiten"] },
        { title: "Abnahme", w: 2, tasks: ["Mängelliste führen", "Abnahme mit Kunde", "Schlussrechnungen prüfen"] },
      ],
      cats: [["Möbel", 70], ["Montage & Lieferung", 15], ["Planung", 10], ["Reserve", 5]],
    },
  },
];

/** Alle wählbaren Vorlagen: mitgelieferte + eigene. */
export async function allTemplates() {
  const own = await q(db.from("project_templates").select("id, name, template").order("name"));
  return [...BUILTIN, ...own.map((t) => ({ ...t, phases: t.template?.phases?.length ?? 0, own: true }))];
}

/** Baut aus einem Projekt (Phasen, Aufgaben, Budgetaufteilung) eine Vorlage. */
export async function templateFromProject(projectId) {
  const [p, phases, tasks, cats] = await Promise.all([
    q(db.from("projects").select("budget_total").eq("id", projectId).single()),
    q(db.from("phases").select("id, title, start_date, due_date").eq("project_id", projectId).order("position")),
    q(db.from("tasks").select("title, phase_id, position").eq("project_id", projectId).order("position")),
    q(db.from("budget_categories").select("name, planned").eq("project_id", projectId).order("position")),
  ]);
  const days = (a, b) => (a && b ? Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000)) : 5);
  const sumPlanned = cats.reduce((s, c) => s + Number(c.planned), 0) || Number(p.budget_total) || 0;
  return {
    phases: phases.map((ph) => ({ title: ph.title, w: days(ph.start_date, ph.due_date), tasks: tasks.filter((t) => t.phase_id === ph.id).map((t) => t.title) })),
    cats: cats.map((c) => [c.name, sumPlanned ? Math.round((Number(c.planned) / sumPlanned) * 1000) / 10 : 0]),
  };
}
