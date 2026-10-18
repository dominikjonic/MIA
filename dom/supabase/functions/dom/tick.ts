// Minuten-Takt (pg_cron → POST /dom/tick): Erinnerungen, Terminhinweise, Tagesbriefing, Visualisierungen,
// viertelstündlich Gmail-Angebotsimport und Nachfass-Automatik.
import { admin, dateDE, localNow, must, timeDE } from "./db.ts";
import { AIUnavailable, askAssistant } from "./ai.ts";
import { runTool } from "./tools.ts";
import { sendWhatsApp } from "./whatsapp.ts";
import { pollVisualizations } from "./higgsfield.ts";
import { followUps, importOffersFromGmail } from "./automation.ts";
import { getConnector } from "./connectors.ts";

/** Stellt eine Nachricht zu: WhatsApp (falls gewünscht und möglich), sonst im App-Chat. */
export async function deliver(owner: string, text: string) {
  const profile = must(await admin.from("profiles").select("reminder_channel").eq("owner_id", owner).single());
  let channel: "whatsapp" | "app" = "app";
  if (profile.reminder_channel === "whatsapp") {
    const r = await sendWhatsApp(owner, text);
    if (r.ok) channel = "whatsapp";
    else console.warn("WhatsApp nicht zugestellt:", r.error);
  }
  // Im Verlauf speichern, damit eine Antwort („erledigt“) den Zusammenhang kennt.
  must(await admin.from("messages").insert({ owner_id: owner, channel, role: "assistant", content: text, meta: { push: true } }));
}

export async function tick() {
  const now = new Date();
  const nowIso = now.toISOString();
  const log: string[] = [];

  // 1. Fällige Erinnerungen
  const reminders = must(await admin.from("reminders").select("*, projects(name)").is("sent_at", null).lte("remind_at", nowIso).limit(50));
  for (const r of reminders) {
    must(await admin.from("reminders").update({ sent_at: nowIso }).eq("id", r.id));
    await deliver(r.owner_id, `⏰ Erinnerung: ${r.text}${r.projects ? ` (${r.projects.name})` : ""}`);
  }
  log.push(`${reminders.length} Erinnerungen`);

  // 2. Aufgaben mit Erinnerungszeit
  const tasks = must(await admin.from("tasks").select("id, owner_id, title, due_date, projects(name)").eq("done", false)
    .is("reminded_at", null).lte("remind_at", nowIso).limit(50));
  for (const t of tasks) {
    must(await admin.from("tasks").update({ reminded_at: nowIso }).eq("id", t.id));
    await deliver(t.owner_id, `⏰ Aufgabe: ${t.title}${t.projects ? ` – ${t.projects.name}` : ""}${t.due_date ? `, fällig ${dateDE(t.due_date)}` : ""}.\nAntworte „erledigt“, wenn sie abgeschlossen ist.`);
  }
  log.push(`${tasks.length} Aufgaben`);

  // 3. Terminhinweise (remind_minutes vor Beginn)
  const soon = must(await admin.from("appointments").select("*, projects(name, address)").is("reminded_at", null)
    .gte("starts_at", nowIso).lte("starts_at", new Date(now.getTime() + 24 * 3600 * 1000).toISOString()).limit(100));
  let apptCount = 0;
  for (const a of soon) {
    const remindAt = new Date(a.starts_at).getTime() - (a.remind_minutes ?? 60) * 60000;
    if (remindAt > now.getTime()) continue;
    must(await admin.from("appointments").update({ reminded_at: nowIso }).eq("id", a.id));
    const where = a.location ?? a.projects?.address;
    await deliver(a.owner_id, `📅 Um ${timeDE(a.starts_at)}: ${a.title}${a.projects ? ` (${a.projects.name})` : ""}${where ? `\n📍 ${where}` : ""}`);
    apptCount++;
  }
  log.push(`${apptCount} Termine`);

  // 4. Tagesbriefing zur eingestellten Uhrzeit (lokale Zeit des Benutzers)
  const profiles = must(await admin.from("profiles").select("*").eq("briefing_enabled", true));
  for (const p of profiles) {
    const local = localNow(p.timezone || "Europe/Vienna");
    if (p.briefing_last_sent === local.date) continue;
    if (local.time < String(p.briefing_time).slice(0, 5)) continue;
    const hasProjects = must(await admin.from("projects").select("id").eq("owner_id", p.owner_id).eq("status", "aktiv").limit(1)).length > 0;
    must(await admin.from("profiles").update({ briefing_last_sent: local.date }).eq("owner_id", p.owner_id));
    if (!hasProjects) continue;
    let text: string;
    try {
      const r = await askAssistant(p.owner_id,
        "Erstelle mein Tagesbriefing für heute: Termine mit Uhrzeit, was heute fällig ist, Überfälliges, Budgetwarnungen und je Projekt den Stand in einem Satz. Schließe mit den 3 wichtigsten Aufgaben für heute.",
        "system");
      text = `☀️ Guten Morgen!\n\n${r.reply}`;
    } catch (e) {
      if (!(e instanceof AIUnavailable)) console.error(e);
      text = `☀️ Guten Morgen!\n\n${await runTool(p.owner_id, "tagesplan", {})}\n\n${await runTool(p.owner_id, "uebersicht", {})}`;
    }
    await deliver(p.owner_id, text);
    log.push(`Briefing ${p.owner_id.slice(0, 8)}`);
  }

  // 5. Laufende Visualisierungen abfragen
  await pollVisualizations();

  // 6. Viertelstündlich: Angebote aus Gmail übernehmen, Nachfassen (Angebotsfristen, überfällige Mängel)
  if (now.getUTCMinutes() % 15 === 0) {
    const all = must(await admin.from("profiles").select("*"));
    for (const p of all) {
      try {
        if ((await getConnector(p.owner_id, "google"))?.secrets.refresh_token) {
          const n = await importOffersFromGmail(p.owner_id, deliver);
          must(await admin.from("profiles").update({ gmail_checked_at: nowIso }).eq("owner_id", p.owner_id));
          if (n) log.push(`${n} Angebote aus Gmail`);
        }
        const f = await followUps(p.owner_id, p, deliver);
        if (f) log.push(`${f} Nachfass-Hinweise`);
      } catch (e) {
        console.error("Automatik", p.owner_id.slice(0, 8), e);
      }
    }
  }

  return log.join(", ");
}
