// Kalender-Abo (iCalendar): Termine, Aufgaben-Fälligkeiten, Phasenenden, Angebotsfristen und Umzüge
// zum Abonnieren in Apple Kalender, Outlook oder Google Kalender.
import { admin, must } from "./db.ts";

const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const stamp = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10).replace(/-/g, "");
};

function fold(line: string) {
  // RFC 5545: Zeilen max. 75 Zeichen
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}

function allDay(uid: string, date: string, summary: string, description = "") {
  return ["BEGIN:VEVENT", `UID:${uid}@dom`, `DTSTAMP:${stamp(new Date())}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`,
    `SUMMARY:${esc(summary)}`, description ? `DESCRIPTION:${esc(description)}` : "", "TRANSP:TRANSPARENT", "END:VEVENT"].filter(Boolean);
}

export async function icsFeed(token: string): Promise<Response> {
  const { data: profile } = await admin.from("profiles").select("owner_id").eq("ics_token", token).maybeSingle();
  if (!profile) return new Response("Nicht gefunden", { status: 404 });
  const owner = profile.owner_id;
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [appts, tasks, phases, tenders, projects] = await Promise.all([
    admin.from("appointments").select("id, title, kind, starts_at, ends_at, location, notes, projects(name)").eq("owner_id", owner).gte("starts_at", since),
    admin.from("tasks").select("id, title, due_date, done, projects(name, status)").eq("owner_id", owner).eq("done", false).not("due_date", "is", null),
    admin.from("phases").select("id, title, due_date, status, projects(name, status)").eq("owner_id", owner).neq("status", "erledigt"),
    admin.from("tenders").select("id, title, deadline, status, projects(name)").eq("owner_id", owner).not("deadline", "is", null).neq("status", "vergeben"),
    admin.from("projects").select("id, name, move_date, end_date").eq("owner_id", owner).eq("status", "aktiv"),
  ]);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DOM//Bueroplanung//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:DOM", "X-WR-TIMEZONE:Europe/Vienna", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const a of must(appts)) {
    const end = a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 3600000).toISOString();
    lines.push("BEGIN:VEVENT", `UID:appt-${a.id}@dom`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(a.starts_at)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(a.projects ? `${a.title} – ${a.projects.name}` : a.title)}`);
    if (a.location) lines.push(`LOCATION:${esc(a.location)}`);
    if (a.notes) lines.push(`DESCRIPTION:${esc(a.notes)}`);
    lines.push("END:VEVENT");
  }
  for (const t of must(tasks)) {
    if (t.projects && t.projects.status !== "aktiv") continue;
    lines.push(...allDay(`task-${t.id}`, t.due_date, `☐ ${t.title}${t.projects ? ` (${t.projects.name})` : ""}`));
  }
  for (const p of must(phases)) {
    if (!p.due_date || p.projects?.status !== "aktiv") continue;
    lines.push(...allDay(`phase-${p.id}`, p.due_date, `◆ Phasenende: ${p.title} – ${p.projects.name}`));
  }
  for (const t of must(tenders)) lines.push(...allDay(`tender-${t.id}`, t.deadline, `⚑ Angebotsfrist: ${t.title}${t.projects ? ` – ${t.projects.name}` : ""}`));
  for (const p of must(projects)) {
    if (p.move_date) lines.push(...allDay(`move-${p.id}`, p.move_date, `🚚 Umzug: ${p.name}`));
    if (p.end_date) lines.push(...allDay(`end-${p.id}`, p.end_date, `✓ Übergabe: ${p.name}`));
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900", "Content-Disposition": 'inline; filename="dom.ics"' },
  });
}
