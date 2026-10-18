// Werkzeuge des KI-Assistenten. Jede Funktion arbeitet nur mit den Daten des Besitzers (owner).
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { admin, dateDE, eur, getProfile, localNow, localToIso, must, timeDE } from "./db.ts";
import { getConnector } from "./connectors.ts";
import { createDraft, searchMail, sendMail, upsertCalendarEvent } from "./google.ts";
import { startVisualization } from "./higgsfield.ts";

type Json = Record<string, any>;

const projectRef = { type: "string", description: "Projektname (Teil genügt) oder Projekt-ID" };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "uebersicht",
    description: "Überblick über alle aktiven Projekte: Fortschritt, aktuelle Phase, überfällige Aufgaben, Budgetstatus. Nutze das für Fragen wie „Wie weit sind die Projekte?“.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "tagesplan",
    description: "Was ist an einem Tag zu tun: fällige und überfällige Aufgaben, Termine, Erinnerungen, Google-Kalender. Ohne Datum = heute.",
    input_schema: { type: "object", properties: { datum: { type: "string", description: "YYYY-MM-DD" } } },
  },
  {
    name: "projekt_details",
    description: "Details zu einem Projekt: Phasen mit Status, offene Aufgaben, Budget, Ausschreibungen, nächste Termine, letzte Doku-Einträge.",
    input_schema: { type: "object", properties: { projekt: projectRef }, required: ["projekt"] },
  },
  {
    name: "projekt_anlegen",
    description: "Neues Projekt anlegen. Erzeugt automatisch die Standardphasen (oder die genannte eigene Vorlage) (Aufmaß bis Abnahme) mit Aufgaben, Terminen und Budgetkategorien.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kunde: { type: "string", description: "Firmenname des Kunden" },
        adresse: { type: "string" },
        start: { type: "string", description: "YYYY-MM-DD, Standard heute" },
        umzug: { type: "string", description: "Umzugs-/Bezugstermin YYYY-MM-DD" },
        uebergabe: { type: "string", description: "YYYY-MM-DD" },
        budget: { type: "number", description: "Gesamtbudget in Euro" },
        arbeitsplaetze: { type: "integer" },
        flaeche_m2: { type: "number" },
        stil: { type: "string", description: "Konzept-Stichworte, z. B. hell, Eiche, Akustik, Open Space" },
        vorlage: { type: "string", description: "Name einer eigenen Projektvorlage; leer = Standard (13 Phasen)" },
      },
      required: ["name"],
    },
  },
  {
    name: "aufgabe_anlegen",
    description: "Aufgabe anlegen, optional mit Fälligkeit und Erinnerung.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        titel: { type: "string" },
        faellig: { type: "string", description: "YYYY-MM-DD" },
        phase: { type: "string", description: "Phasenname, z. B. Ausschreibung" },
        erinnerung: { type: "string", description: "Lokale Zeit YYYY-MM-DDTHH:MM" },
        notiz: { type: "string" },
      },
      required: ["titel"],
    },
  },
  {
    name: "aufgabe_erledigt",
    description: "Aufgabe als erledigt markieren. Suche per Text im Titel (optional eingeschränkt auf ein Projekt) oder per ID.",
    input_schema: {
      type: "object",
      properties: { suche: { type: "string" }, projekt: projectRef, id: { type: "string" } },
    },
  },
  {
    name: "doku_eintrag",
    description: "Fortschritt/Bautagebuch-Eintrag zu einem Projekt speichern (z. B. Ergebnis einer Besichtigung). Optional Dateien (z. B. per WhatsApp empfangene Fotos) zuordnen.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        text: { type: "string" },
        datei_ids: { type: "array", items: { type: "string" } },
      },
      required: ["projekt", "text"],
    },
  },
  {
    name: "termin_anlegen",
    description: "Termin anlegen (Besichtigung, Aufmaß, Präsentation, Lieferung, Montage, Umzug, Abnahme). Wird mit Google Kalender synchronisiert, falls verbunden.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        titel: { type: "string" },
        art: { type: "string", enum: ["termin", "besichtigung", "aufmass", "praesentation", "lieferung", "montage", "umzug", "abnahme"] },
        beginn: { type: "string", description: "Lokale Zeit YYYY-MM-DDTHH:MM" },
        dauer_min: { type: "integer" },
        ort: { type: "string" },
        notiz: { type: "string" },
      },
      required: ["titel", "beginn"],
    },
  },
  {
    name: "erinnerung_setzen",
    description: "Erinnerung per WhatsApp zu einer bestimmten Zeit.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" }, zeitpunkt: { type: "string", description: "Lokale Zeit YYYY-MM-DDTHH:MM" }, projekt: projectRef },
      required: ["text", "zeitpunkt"],
    },
  },
  {
    name: "budget",
    description: "Budgetübersicht eines Projekts je Kategorie: Plan, beauftragt, abgerechnet, Prognose, Warnungen.",
    input_schema: { type: "object", properties: { projekt: projectRef }, required: ["projekt"] },
  },
  {
    name: "kosten_erfassen",
    description: "Beauftragung oder Rechnung im Budget erfassen.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        kategorie: { type: "string", description: "Budgetkategorie, z. B. Möbel" },
        art: { type: "string", enum: ["beauftragt", "rechnung"] },
        titel: { type: "string" },
        betrag: { type: "number" },
      },
      required: ["projekt", "kategorie", "art", "titel", "betrag"],
    },
  },
  {
    name: "angebote_vergleichen",
    description: "Preisspiegel aller Ausschreibungen eines Projekts: Summen je Bieter, Vollständigkeit, günstigster Bieter, Lieferzeit, Budgetabgleich.",
    input_schema: { type: "object", properties: { projekt: projectRef }, required: ["projekt"] },
  },
  {
    name: "kontakte_suchen",
    description: "Kontakte (Kunden, Lieferanten, Handwerker, Speditionen) suchen.",
    input_schema: { type: "object", properties: { suche: { type: "string" }, art: { type: "string" } } },
  },
  {
    name: "stueckliste_ergaenzen",
    description: "Positionen zur Stückliste eines Projekts hinzufügen.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        positionen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, menge: { type: "number" }, einheit: { type: "string" }, raum: { type: "string" },
              kategorie: { type: "string" }, hersteller: { type: "string" }, artikelnr: { type: "string" }, preis: { type: "number" },
            },
            required: ["name"],
          },
        },
      },
      required: ["projekt", "positionen"],
    },
  },
  {
    name: "email_entwurf",
    description: "E-Mail als Entwurf im Gmail-Firmenkonto speichern (wird NICHT gesendet). Schreibe Betreff und Text vorher fertig formuliert in Sie-Form.",
    input_schema: {
      type: "object",
      properties: { an: { type: "string" }, cc: { type: "string" }, betreff: { type: "string" }, text: { type: "string" } },
      required: ["an", "betreff", "text"],
    },
  },
  {
    name: "email_senden",
    description: "E-Mail sofort senden. NUR verwenden, wenn der Benutzer ausdrücklich „senden“ bestätigt hat, nachdem er den Text gesehen hat.",
    input_schema: {
      type: "object",
      properties: { an: { type: "string" }, cc: { type: "string" }, betreff: { type: "string" }, text: { type: "string" } },
      required: ["an", "betreff", "text"],
    },
  },
  {
    name: "emails_suchen",
    description: "Im Gmail-Postfach suchen (Gmail-Suchsyntax, z. B. „from:tischlerei has:attachment newer_than:7d“). Für Fragen wie „Hat Firma X schon ein Angebot geschickt?“.",
    input_schema: { type: "object", properties: { suche: { type: "string" } }, required: ["suche"] },
  },
  {
    name: "visualisierung_starten",
    description: "Fotorealistische Innenraum-Visualisierung bei Higgsfield erzeugen. Schreibe einen präzisen englischen Bild-Prompt (Raumtyp, Möbel, Materialien, Licht, Kamerawinkel, Stil).",
    input_schema: {
      type: "object",
      properties: { projekt: projectRef, prompt: { type: "string" }, referenzbild_datei_id: { type: "string" } },
      required: ["projekt", "prompt"],
    },
  },
  {
    name: "desktop_auftrag",
    description: "Auftrag an Blender, SketchUp oder AutoCAD auf dem Rechner des Benutzers (über die DOM-Desktop-Brücke). Aktionen: stueckliste_export (Möbel/Bauteile zählen und in die Stückliste übernehmen), szene_info, render (Blender-Rendering), python (Blender-Python-Code ausführen).",
    input_schema: {
      type: "object",
      properties: {
        programm: { type: "string", enum: ["blender", "sketchup", "autocad"] },
        aktion: { type: "string", enum: ["stueckliste_export", "szene_info", "render", "python"] },
        projekt: projectRef,
        parameter: { type: "object", description: "z. B. {\"code\": \"...\"} für python" },
      },
      required: ["programm", "aktion"],
    },
  },
  {
    name: "mangel_erfassen",
    description: "Mangel in die Mängelliste eines Projekts eintragen (z. B. bei Besichtigung/Abnahme). Optional zuständigen Handwerker, Frist und Foto (Datei-ID, z. B. per WhatsApp empfangen). Ist die Frist überschritten, erinnert DOM den Handwerker automatisch per Mail-Entwurf.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        titel: { type: "string", description: "Kurzbeschreibung, z. B. „Kratzer Tischplatte“" },
        ort: { type: "string", description: "Raum/Ort, z. B. „Besprechung 2.04“" },
        handwerker: { type: "string", description: "Firma oder Name des Zuständigen (aus Kontakten)" },
        frist: { type: "string", description: "YYYY-MM-DD" },
        foto_datei_id: { type: "string" },
        notiz: { type: "string" },
      },
      required: ["projekt", "titel"],
    },
  },
  {
    name: "maengel",
    description: "Mängel auflisten (offen oder alle) oder einen Mangel als behoben markieren (Suche im Titel).",
    input_schema: {
      type: "object",
      properties: { projekt: projectRef, behoben: { type: "string", description: "Suchtext des Mangels, der behoben ist" }, alle: { type: "boolean" } },
    },
  },
  {
    name: "zeit_erfassen",
    description: "Arbeitszeit für ein Projekt buchen, z. B. „2 h Planung Huber“ → projekt Huber, stunden 2, phase Planung. Mit aktion start/stopp läuft eine Stoppuhr.",
    input_schema: {
      type: "object",
      properties: {
        projekt: projectRef,
        aktion: { type: "string", enum: ["buchen", "start", "stopp"], description: "Standard buchen" },
        stunden: { type: "number", description: "Dauer in Stunden, z. B. 1.5" },
        phase: { type: "string" },
        datum: { type: "string", description: "YYYY-MM-DD, Standard heute" },
        notiz: { type: "string" },
      },
    },
  },
  {
    name: "zeiten",
    description: "Gebuchte Stunden eines Projekts (gesamt, je Phase, letzte Einträge) inkl. Wert nach Stundensatz.",
    input_schema: { type: "object", properties: { projekt: projectRef }, required: ["projekt"] },
  },
];

// ---------------------------------------------------------------- Hilfen

async function findProject(owner: string, ref?: string) {
  if (!ref) throw new Error("Welches Projekt? Bitte Namen nennen.");
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    return must(await admin.from("projects").select("*").eq("owner_id", owner).eq("id", ref).single());
  }
  const rows = must(await admin.from("projects").select("*").eq("owner_id", owner).ilike("name", `%${ref}%`).limit(5));
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new Error(`Kein Projekt gefunden zu „${ref}“.`);
  const exact = rows.find((r: Json) => r.name.toLowerCase() === ref.toLowerCase());
  if (exact) return exact;
  throw new Error(`Mehrere Projekte passen: ${rows.map((r: Json) => r.name).join(", ")}. Welches ist gemeint?`);
}

async function findCategory(owner: string, projectId: string, name: string) {
  const rows = must(await admin.from("budget_categories").select("*").eq("owner_id", owner).eq("project_id", projectId));
  const n = name.toLowerCase();
  return rows.find((r: Json) => r.name.toLowerCase() === n) ?? rows.find((r: Json) => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase().split(" ")[0]));
}

async function findPhase(projectId: string, name?: string) {
  if (!name) return null;
  const rows = must(await admin.from("phases").select("id, title").eq("project_id", projectId).ilike("title", `%${name}%`).limit(1));
  return rows[0] ?? null;
}

async function findContact(owner: string, name?: string) {
  if (!name) return null;
  const s = name.replace(/[,()%*]/g, " ").trim();
  const rows = must(await admin.from("contacts").select("id, company, name, email").eq("owner_id", owner).or(`company.ilike.%${s}%,name.ilike.%${s}%`).limit(1));
  return rows[0] ?? null;
}

/** Beendet laufende Stoppuhren und bucht die Minuten. */
async function stopTimers(owner: string) {
  const running = must(await admin.from("time_entries").select("id, started_at, projects(name)").eq("owner_id", owner).not("started_at", "is", null));
  let last: { minutes: number; project: string } | null = null;
  for (const r of running) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000));
    must(await admin.from("time_entries").update({ minutes, started_at: null }).eq("id", r.id));
    last = { minutes, project: r.projects?.name ?? "" };
  }
  return last;
}

const hours = (min: number) => `${(min / 60).toLocaleString("de-AT", { maximumFractionDigits: 1 })} h`;

const stateLabel: Record<string, string> = { im_budget: "im Budget", knapp: "knapp (Kategorie über Plan)", ueberschritten: "ÜBERSCHRITTEN", offen: "kein Budget hinterlegt" };

// ---------------------------------------------------------------- Ausführung

export async function runTool(owner: string, name: string, input: Json): Promise<string> {
  const profile = await getProfile(owner);
  const tz = profile.timezone || "Europe/Vienna";

  switch (name) {
    case "uebersicht": {
      const rows = must(await admin.from("v_project_status").select("*").eq("owner_id", owner).eq("status", "aktiv").order("move_date"));
      if (!rows.length) return "Keine aktiven Projekte.";
      return rows.map((p: Json) =>
        `• ${p.name}: ${p.progress_pct} % erledigt (${p.tasks_done}/${p.tasks_total}), aktuelle Phase „${p.current_phase ?? "–"}“ bis ${dateDE(p.current_phase_due, tz)}, ` +
        `${p.overdue} überfällig, Umzug ${dateDE(p.move_date, tz)}, Budget ${stateLabel[p.budget_state]} (Prognose ${eur(p.forecast)} von ${eur(p.budget_total)}) [id ${p.project_id}]`
      ).join("\n");
    }

    case "tagesplan": {
      const day = input.datum || localNow(tz).date;
      const dayStart = localToIso(`${day}T00:00`, tz);
      const dayEnd = localToIso(`${day}T23:59`, tz);
      const tasks = must(await admin.from("tasks").select("id, title, due_date, priority, projects(name), phases(title)")
        .eq("owner_id", owner).eq("done", false).lte("due_date", day).order("due_date").limit(40));
      const appts = must(await admin.from("appointments").select("title, kind, starts_at, location, projects(name)")
        .eq("owner_id", owner).gte("starts_at", dayStart).lte("starts_at", dayEnd).order("starts_at"));
      const rem = must(await admin.from("reminders").select("text, remind_at").eq("owner_id", owner).is("sent_at", null)
        .gte("remind_at", dayStart).lte("remind_at", dayEnd));
      let cal: Json[] = [];
      if (await getConnector(owner, "google")) {
        try {
          const { todaysCalendar } = await import("./google.ts");
          cal = await todaysCalendar(owner, dayStart, dayEnd);
        } catch { /* Google optional */ }
      }
      const out = [`Tagesplan ${dateDE(day, tz)}:`];
      out.push(appts.length ? "Termine:\n" + appts.map((a: Json) => `• ${timeDE(a.starts_at, tz)} ${a.title}${a.projects ? ` (${a.projects.name})` : ""}${a.location ? `, ${a.location}` : ""}`).join("\n") : "Keine DOM-Termine.");
      if (cal.length) out.push("Google Kalender:\n" + cal.map((e) => `• ${e.start?.length > 10 ? timeDE(e.start, tz) : "ganztägig"} ${e.title}`).join("\n"));
      const overdue = tasks.filter((t: Json) => t.due_date < day);
      const due = tasks.filter((t: Json) => t.due_date === day);
      out.push(due.length ? "Fällig:\n" + due.map((t: Json) => `• ${t.title} – ${t.projects?.name ?? "ohne Projekt"} [id ${t.id}]`).join("\n") : "Keine Aufgaben fällig.");
      if (overdue.length) out.push(`Überfällig (${overdue.length}):\n` + overdue.slice(0, 15).map((t: Json) => `• ${t.title} – ${t.projects?.name ?? ""}, seit ${dateDE(t.due_date, tz)} [id ${t.id}]`).join("\n"));
      if (rem.length) out.push("Erinnerungen:\n" + rem.map((r: Json) => `• ${timeDE(r.remind_at, tz)} ${r.text}`).join("\n"));
      // Fristen: Angebotsfristen (heute oder abgelaufen ohne Vergabe), Phasenenden, Umzüge
      const [tenders, phasesDue, moves] = await Promise.all([
        admin.from("tenders").select("title, deadline, status, projects(name), offers(id)").eq("owner_id", owner).neq("status", "vergeben").lte("deadline", day),
        admin.from("phases").select("title, due_date, projects(name, status)").eq("owner_id", owner).neq("status", "erledigt").eq("due_date", day),
        admin.from("projects").select("name, move_date").eq("owner_id", owner).eq("status", "aktiv").eq("move_date", day),
      ]);
      const fristen = [
        ...must(tenders).map((t: Json) => `• Angebotsfrist „${t.title}“ (${t.projects?.name ?? ""})${t.deadline < day ? ` – abgelaufen seit ${dateDE(t.deadline, tz)}` : " – heute"}, ${t.offers?.length ?? 0} Angebote`),
        ...must(phasesDue).filter((p: Json) => p.projects?.status === "aktiv").map((p: Json) => `• Phasenende „${p.title}“ (${p.projects.name})`),
        ...must(moves).map((p: Json) => `• UMZUG heute: ${p.name}`),
      ];
      const defects = must(await admin.from("defects").select("title, due_date, projects(name), contacts(company, name)").eq("owner_id", owner).eq("status", "offen").lte("due_date", day));
      fristen.push(...defects.map((d: Json) => `• Mangel „${d.title}“ (${d.projects?.name ?? ""})${d.contacts ? `, ${d.contacts.company ?? d.contacts.name}` : ""} – Frist ${dateDE(d.due_date, tz)}`));
      if (fristen.length) out.push("Fristen:\n" + fristen.join("\n"));
      return out.join("\n\n");
    }

    case "projekt_details": {
      const p = await findProject(owner, input.projekt);
      const [status, phases, tasks, budget, tenders, appts, logs] = await Promise.all([
        admin.from("v_project_status").select("*").eq("project_id", p.id).single(),
        admin.from("phases").select("title, status, due_date").eq("project_id", p.id).order("position"),
        admin.from("tasks").select("id, title, due_date, phases(title)").eq("project_id", p.id).eq("done", false).order("due_date").limit(12),
        admin.from("v_budget_categories").select("*").eq("project_id", p.id).order("position"),
        admin.from("tenders").select("title, status, deadline").eq("project_id", p.id),
        admin.from("appointments").select("title, starts_at").eq("project_id", p.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(5),
        admin.from("logs").select("entry_date, text").eq("project_id", p.id).order("entry_date", { ascending: false }).limit(5),
      ]);
      const s = must(status);
      return [
        `${p.name} (${p.status}) – ${p.address ?? "ohne Adresse"}; Start ${dateDE(p.start_date, tz)}, Umzug ${dateDE(p.move_date, tz)}, Übergabe ${dateDE(p.end_date, tz)}; ${p.workplaces ?? "?"} Arbeitsplätze, ${p.area_sqm ?? "?"} m²; Stil: ${p.style ?? "–"}`,
        `Fortschritt ${s.progress_pct} %, ${s.overdue} überfällig. Budget ${eur(p.budget_total)}, Prognose ${eur(s.forecast)} → ${stateLabel[s.budget_state]}.`,
        "Phasen:\n" + must(phases).map((x: Json) => `• ${x.title}: ${x.status} (bis ${dateDE(x.due_date, tz)})`).join("\n"),
        "Nächste offene Aufgaben:\n" + must(tasks).map((t: Json) => `• ${t.title} (${t.phases?.title ?? "–"}, ${dateDE(t.due_date, tz)}) [id ${t.id}]`).join("\n"),
        "Budget:\n" + must(budget).map((b: Json) => `• ${b.name}: Plan ${eur(b.planned)}, beauftragt ${eur(b.committed)}, abgerechnet ${eur(b.invoiced)}`).join("\n"),
        "Ausschreibungen: " + (must(tenders).map((t: Json) => `${t.title} (${t.status})`).join(", ") || "keine"),
        "Termine: " + (must(appts).map((a: Json) => `${a.title} ${dateDE(a.starts_at, tz)} ${timeDE(a.starts_at, tz)}`).join("; ") || "keine"),
        "Letzte Doku: " + (must(logs).map((l: Json) => `${dateDE(l.entry_date, tz)}: ${l.text}`).join(" | ") || "keine"),
        `[id ${p.id}]`,
      ].join("\n");
    }

    case "projekt_anlegen": {
      let clientId = null;
      if (input.kunde) {
        const found = must(await admin.from("contacts").select("id").eq("owner_id", owner).eq("kind", "kunde").ilike("company", input.kunde).limit(1));
        clientId = found[0]?.id ?? must(await admin.from("contacts").insert({ owner_id: owner, kind: "kunde", company: input.kunde }).select("id").single()).id;
      }
      const p = must(await admin.from("projects").insert({
        owner_id: owner, name: input.name, client_id: clientId, address: input.adresse ?? null,
        start_date: input.start || localNow(tz).date, move_date: input.umzug ?? null, end_date: input.uebergabe ?? null,
        budget_total: input.budget ?? 0, workplaces: input.arbeitsplaetze ?? null, area_sqm: input.flaeche_m2 ?? null, style: input.stil ?? null,
      }).select("*").single());
      const tpl = input.vorlage
        ? must(await admin.from("project_templates").select("name, template").eq("owner_id", owner).ilike("name", `%${input.vorlage}%`).limit(1))[0]
        : null;
      must(await admin.rpc("apply_project_template", { p_project: p.id, p_template: tpl?.template ?? null }));
      const count = tpl?.template?.phases?.length ?? 13;
      return `Projekt „${p.name}“ angelegt mit ${count} Phasen${tpl ? ` (Vorlage „${tpl.name}“)` : ""}, Aufgaben und Budgetkategorien. [id ${p.id}]`;
    }

    case "aufgabe_anlegen": {
      const p = input.projekt ? await findProject(owner, input.projekt) : null;
      let phaseId = null;
      if (p && input.phase) {
        const ph = must(await admin.from("phases").select("id").eq("project_id", p.id).ilike("title", `%${input.phase}%`).limit(1));
        phaseId = ph[0]?.id ?? null;
      }
      const t = must(await admin.from("tasks").insert({
        owner_id: owner, project_id: p?.id ?? null, phase_id: phaseId, title: input.titel, notes: input.notiz ?? null,
        due_date: input.faellig ?? null, remind_at: input.erinnerung ? localToIso(input.erinnerung, tz) : null, created_by: "ki",
      }).select("id").single());
      return `Aufgabe angelegt: „${input.titel}“${input.faellig ? `, fällig ${dateDE(input.faellig, tz)}` : ""}${input.erinnerung ? `, Erinnerung ${input.erinnerung.replace("T", " ")}` : ""}. [id ${t.id}]`;
    }

    case "aufgabe_erledigt": {
      let q = admin.from("tasks").select("id, title, projects(name)").eq("owner_id", owner).eq("done", false);
      if (input.id) q = q.eq("id", input.id);
      else {
        if (!input.suche) throw new Error("Welche Aufgabe?");
        q = q.ilike("title", `%${input.suche}%`);
        if (input.projekt) q = q.eq("project_id", (await findProject(owner, input.projekt)).id);
      }
      const rows = must(await q.limit(6));
      if (!rows.length) return "Keine passende offene Aufgabe gefunden.";
      if (rows.length > 1 && !input.id) {
        return "Mehrere Aufgaben passen – welche?\n" + rows.map((r: Json) => `• ${r.title} (${r.projects?.name ?? "–"}) [id ${r.id}]`).join("\n");
      }
      must(await admin.from("tasks").update({ done: true }).eq("id", rows[0].id));
      return `Erledigt: „${rows[0].title}“ (${rows[0].projects?.name ?? "ohne Projekt"}).`;
    }

    case "doku_eintrag": {
      const p = await findProject(owner, input.projekt);
      const log = must(await admin.from("logs").insert({ owner_id: owner, project_id: p.id, text: input.text, source: "ki" }).select("id").single());
      const ids: string[] = input.datei_ids ?? [];
      for (const id of ids) {
        const f = must(await admin.from("files").select("id, storage_path, name").eq("id", id).eq("owner_id", owner).single());
        const newPath = `${owner}/${p.id}/${f.name}`;
        if (f.storage_path !== newPath) {
          const moved = await admin.storage.from("files").move(f.storage_path, newPath);
          must(await admin.from("files").update({
            project_id: p.id, log_id: log.id, ...(moved.error ? {} : { storage_path: newPath }),
          }).eq("id", id));
        }
      }
      return `Doku-Eintrag bei „${p.name}“ gespeichert${ids.length ? ` mit ${ids.length} Datei(en)` : ""}.`;
    }

    case "termin_anlegen": {
      const p = input.projekt ? await findProject(owner, input.projekt) : null;
      const starts = localToIso(input.beginn, tz);
      const ends = new Date(new Date(starts).getTime() + (input.dauer_min ?? 60) * 60000).toISOString();
      const a = must(await admin.from("appointments").insert({
        owner_id: owner, project_id: p?.id ?? null, title: input.titel, kind: input.art ?? "termin",
        starts_at: starts, ends_at: ends, location: input.ort ?? p?.address ?? null, notes: input.notiz ?? null,
      }).select("id").single());
      let sync = "";
      if (await getConnector(owner, "google")) {
        try {
          await upsertCalendarEvent(owner, a.id);
          sync = " und in Google Kalender eingetragen";
        } catch (e) {
          sync = ` (Google Kalender: ${(e as Error).message})`;
        }
      }
      return `Termin „${input.titel}“ am ${dateDE(starts, tz)} um ${timeDE(starts, tz)} angelegt${sync}.`;
    }

    case "erinnerung_setzen": {
      const p = input.projekt ? await findProject(owner, input.projekt) : null;
      const at = localToIso(input.zeitpunkt, tz);
      must(await admin.from("reminders").insert({ owner_id: owner, project_id: p?.id ?? null, text: input.text, remind_at: at, created_by: "ki" }));
      return `Erinnerung gesetzt für ${dateDE(at, tz)} um ${timeDE(at, tz)}.`;
    }

    case "budget": {
      const p = await findProject(owner, input.projekt);
      const cats = must(await admin.from("v_budget_categories").select("*").eq("project_id", p.id).order("position"));
      const s = must(await admin.from("v_project_status").select("*").eq("project_id", p.id).single());
      const warn = cats.filter((c: Json) => Number(c.forecast) > Number(c.planned) && Number(c.planned) > 0)
        .map((c: Json) => `⚠ ${c.name}: Prognose ${eur(c.forecast)} > Plan ${eur(c.planned)} (+${eur(Number(c.forecast) - Number(c.planned))})`);
      return [
        `Budget ${p.name}: ${eur(p.budget_total)} – Prognose ${eur(s.forecast)} → ${stateLabel[s.budget_state]}. Beauftragt ${eur(s.committed)}, abgerechnet ${eur(s.invoiced)}, Rest ${eur(Number(p.budget_total) - Number(s.forecast))}.`,
        ...cats.map((c: Json) => `• ${c.name}: Plan ${eur(c.planned)} | beauftragt ${eur(c.committed)} | abgerechnet ${eur(c.invoiced)} | Prognose ${eur(c.forecast)}`),
        ...warn,
      ].join("\n");
    }

    case "kosten_erfassen": {
      const p = await findProject(owner, input.projekt);
      const cat = await findCategory(owner, p.id, input.kategorie);
      must(await admin.from("costs").insert({
        owner_id: owner, project_id: p.id, category_id: cat?.id ?? null, kind: input.art, title: input.titel, amount: input.betrag,
      }));
      return `${input.art === "rechnung" ? "Rechnung" : "Beauftragung"} über ${eur(input.betrag)} bei „${p.name}“ in ${cat?.name ?? "ohne Kategorie"} erfasst.`;
    }

    case "angebote_vergleichen": {
      const p = await findProject(owner, input.projekt);
      const tenders = must(await admin.from("tenders").select("id, title, status, category_id").eq("project_id", p.id));
      if (!tenders.length) return "Für dieses Projekt gibt es noch keine Ausschreibungen.";
      const out: string[] = [];
      for (const t of tenders) {
        const offers = must(await admin.from("v_offer_totals").select("*").eq("tender_id", t.id).order("total"));
        const cat = t.category_id ? must(await admin.from("v_budget_categories").select("*").eq("category_id", t.category_id).single()) : null;
        out.push(`Ausschreibung „${t.title}“ (${t.status})${cat ? `, Budget ${cat.name}: ${eur(cat.planned)}` : ""}`);
        if (!offers.length) { out.push("  noch keine Angebote"); continue; }
        offers.forEach((o: Json, i: number) => {
          const complete = o.priced_positions >= o.all_positions ? "vollständig" : `UNVOLLSTÄNDIG (${o.priced_positions}/${o.all_positions} Positionen)`;
          const fit = cat ? (Number(o.total) <= Number(cat.planned) ? "im Budget" : `+${eur(Number(o.total) - Number(cat.planned))} über Budget`) : "";
          out.push(`  ${i + 1}. ${o.bidder}: ${eur(o.total)} (${complete}${o.delivery_weeks ? `, ${o.delivery_weeks} Wo. Lieferzeit` : ""}${o.discount_pct > 0 ? `, ${o.discount_pct} % Rabatt` : ""}) ${fit} [${o.status}]`);
        });
      }
      return out.join("\n");
    }

    case "kontakte_suchen": {
      let q = admin.from("contacts").select("kind, company, name, trade, email, phone").eq("owner_id", owner);
      if (input.art) q = q.eq("kind", input.art);
      const s = String(input.suche ?? "").replace(/[,()%*]/g, " ").trim();
      if (s) q = q.or(`company.ilike.%${s}%,name.ilike.%${s}%,trade.ilike.%${s}%`);
      const rows = must(await q.limit(15));
      return rows.length ? rows.map((c: Json) => `• ${c.company ?? ""} ${c.name ?? ""} (${c.kind}${c.trade ? `, ${c.trade}` : ""}) ${c.email ?? ""} ${c.phone ?? ""}`).join("\n") : "Keine Kontakte gefunden.";
    }

    case "stueckliste_ergaenzen": {
      const p = await findProject(owner, input.projekt);
      const rows = (input.positionen as Json[]).map((x) => ({
        owner_id: owner, project_id: p.id, name: x.name, quantity: x.menge ?? 1, unit: x.einheit ?? "Stk", room: x.raum ?? null,
        category: x.kategorie ?? null, manufacturer: x.hersteller ?? null, article_no: x.artikelnr ?? null, unit_price_est: x.preis ?? null, source: "ki",
      }));
      must(await admin.from("items").insert(rows));
      return `${rows.length} Position(en) zur Stückliste von „${p.name}“ hinzugefügt.`;
    }

    case "email_entwurf": {
      const signature = profile.email_signature ? `\n\n${profile.email_signature}` : "";
      const r = await createDraft(owner, { to: input.an, cc: input.cc, subject: input.betreff, body: input.text + signature });
      return `Entwurf in Gmail gespeichert (${r.link}). Noch nicht gesendet.`;
    }

    case "email_senden": {
      const signature = profile.email_signature ? `\n\n${profile.email_signature}` : "";
      await sendMail(owner, { to: input.an, cc: input.cc, subject: input.betreff, body: input.text + signature });
      return `E-Mail an ${input.an} gesendet.`;
    }

    case "emails_suchen": {
      const rows = await searchMail(owner, input.suche);
      return rows.length ? rows.map((m) => `• ${m.date}: ${m.from} – „${m.subject}“${m.has_attachment ? " 📎" : ""}\n  ${m.snippet}`).join("\n") : "Keine passenden E-Mails.";
    }

    case "visualisierung_starten": {
      const p = await findProject(owner, input.projekt);
      let imageUrl: string | undefined;
      if (input.referenzbild_datei_id) {
        const f = must(await admin.from("files").select("storage_path").eq("id", input.referenzbild_datei_id).eq("owner_id", owner).single());
        imageUrl = must(await admin.storage.from("files").createSignedUrl(f.storage_path, 3600)).signedUrl;
      }
      const r = await startVisualization(owner, p.id, input.prompt, imageUrl);
      return r.status === "fertig" ? "Visualisierung fertig und im Projekt gespeichert." : "Visualisierung läuft. Das Bild erscheint in wenigen Minuten im Projekt unter Dateien.";
    }

    case "mangel_erfassen": {
      const p = await findProject(owner, input.projekt);
      const c = await findContact(owner, input.handwerker);
      must(await admin.from("defects").insert({
        owner_id: owner, project_id: p.id, title: input.titel, location: input.ort ?? null, contact_id: c?.id ?? null,
        due_date: input.frist ?? null, file_id: input.foto_datei_id ?? null, notes: input.notiz ?? null,
      }));
      return `Mangel „${input.titel}“ in „${p.name}“ eingetragen${c ? `, zuständig ${c.company ?? c.name}` : input.handwerker ? ` (Kontakt „${input.handwerker}“ nicht gefunden)` : ""}${input.frist ? `, Frist ${dateDE(input.frist, tz)}` : ""}.`;
    }

    case "maengel": {
      const p = input.projekt ? await findProject(owner, input.projekt) : null;
      if (input.behoben) {
        let q = admin.from("defects").select("id, title").eq("owner_id", owner).eq("status", "offen").ilike("title", `%${input.behoben}%`);
        if (p) q = q.eq("project_id", p.id);
        const rows = must(await q.limit(2));
        if (!rows.length) return `Kein offener Mangel zu „${input.behoben}“.`;
        if (rows.length > 1) return "Mehrere Mängel passen – bitte genauer beschreiben.";
        must(await admin.from("defects").update({ status: "behoben", fixed_at: new Date().toISOString() }).eq("id", rows[0].id));
        return `„${rows[0].title}“ als behoben markiert.`;
      }
      let q = admin.from("defects").select("title, location, status, due_date, contacts(company, name), projects(name)").eq("owner_id", owner).order("due_date");
      if (p) q = q.eq("project_id", p.id);
      if (!input.alle) q = q.eq("status", "offen");
      const rows = must(await q.limit(40));
      return rows.length ? rows.map((d: Json) => `• ${d.title}${d.location ? ` (${d.location})` : ""} – ${d.projects?.name}, ${d.contacts ? (d.contacts.company ?? d.contacts.name) : "ohne Zuständigen"}${d.due_date ? `, Frist ${dateDE(d.due_date, tz)}` : ""} [${d.status}]`).join("\n") : "Keine offenen Mängel.";
    }

    case "zeit_erfassen": {
      const aktion = input.aktion ?? "buchen";
      if (aktion === "stopp") {
        const stopped = await stopTimers(owner);
        return stopped ? `Stoppuhr gestoppt: ${hours(stopped.minutes)} für „${stopped.project}“ gebucht.` : "Es läuft keine Stoppuhr.";
      }
      const p = await findProject(owner, input.projekt);
      const ph = await findPhase(p.id, input.phase);
      if (aktion === "start") {
        await stopTimers(owner);
        must(await admin.from("time_entries").insert({ owner_id: owner, project_id: p.id, phase_id: ph?.id ?? null, entry_date: localNow(tz).date, started_at: new Date().toISOString(), note: input.notiz ?? null }));
        return `Stoppuhr für „${p.name}“ läuft. Sag „Stopp“, wenn du fertig bist.`;
      }
      const min = Math.round(Number(input.stunden ?? 0) * 60);
      if (!min) return "Wie viele Stunden soll ich buchen?";
      must(await admin.from("time_entries").insert({ owner_id: owner, project_id: p.id, phase_id: ph?.id ?? null, entry_date: input.datum || localNow(tz).date, minutes: min, note: input.notiz ?? null }));
      return `${hours(min)} für „${p.name}“${ph ? ` (${ph.title})` : ""} gebucht.`;
    }

    case "zeiten": {
      const p = await findProject(owner, input.projekt);
      const rows = must(await admin.from("time_entries").select("entry_date, minutes, note, phases(title)").eq("project_id", p.id).not("minutes", "is", null).order("entry_date", { ascending: false }));
      const total = rows.reduce((a: number, r: Json) => a + r.minutes, 0);
      const byPhase: Record<string, number> = {};
      for (const r of rows) byPhase[r.phases?.title ?? "Ohne Phase"] = (byPhase[r.phases?.title ?? "Ohne Phase"] ?? 0) + r.minutes;
      const rate = Number(profile.hourly_rate ?? 0);
      return [
        `„${p.name}“: ${hours(total)} gesamt${rate ? ` = ${eur(total / 60 * rate)} bei ${eur(rate)}/h` : ""}.`,
        Object.entries(byPhase).map(([k, v]) => `• ${k}: ${hours(v)}`).join("\n"),
        rows.length ? "Letzte Einträge:\n" + rows.slice(0, 8).map((r: Json) => `• ${dateDE(r.entry_date, tz)}: ${hours(r.minutes)}${r.note ? ` – ${r.note}` : ""}`).join("\n") : "",
      ].filter(Boolean).join("\n");
    }

    case "desktop_auftrag": {
      const p = input.projekt ? await findProject(owner, input.projekt) : null;
      if (!(await getConnector(owner, "bridge"))) return "Die Desktop-Brücke ist noch nicht eingerichtet (Konnektoren → Desktop-Brücke).";
      must(await admin.from("bridge_jobs").insert({
        owner_id: owner, target: input.programm, project_id: p?.id ?? null, action: input.aktion, payload: input.parameter ?? {},
      }));
      return `Auftrag an ${input.programm} übergeben. Er wird ausgeführt, sobald die Desktop-Brücke auf deinem Rechner läuft.`;
    }
  }
  throw new Error(`Unbekanntes Werkzeug ${name}`);
}
