// Automatiken im Viertelstunden-Takt: Angebote aus Gmail übernehmen, Nachfassen vor Fristen und bei überfälligen Mängeln.
import { admin, dateDE, localNow, must } from "./db.ts";
import { compose } from "./ai.ts";
import { getConnector } from "./connectors.ts";
import { attachmentBytes, createDraft, listMessageIds, messageWithPdfs } from "./google.ts";
import { extractOffer } from "./extract.ts";

type Json = Record<string, any>;
type Deliver = (owner: string, text: string) => Promise<void>;

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const company = (c: Json | null | undefined) => c?.company ?? c?.name ?? "Unbekannt";

// ---------------------------------------------------------------- Angebote aus Gmail

/** Sucht PDF-Anhänge von eingeladenen Bietern offener Ausschreibungen und legt daraus Angebote an. */
export async function importOffersFromGmail(owner: string, deliver: Deliver) {
  const tenders = must(await admin.from("tenders")
    .select("id, title, project_id, created_at, projects(name), tender_bidders(contacts(id, email, company, name)), offers(contact_id)")
    .eq("owner_id", owner).eq("status", "versendet"));
  const byEmail = new Map<string, { tender: Json; contact: Json }[]>();
  for (const t of tenders) {
    for (const b of t.tender_bidders ?? []) {
      const email = b.contacts?.email?.trim().toLowerCase();
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), { tender: t, contact: b.contacts }]);
    }
  }
  if (!byEmail.size) return 0;

  const ids = await listMessageIds(owner, `from:(${[...byEmail.keys()].join(" OR ")}) has:attachment filename:pdf newer_than:45d`);
  if (!ids.length) return 0;
  const seen = new Set(must(await admin.from("gmail_imports").select("message_id").eq("owner_id", owner).in("message_id", ids)).map((r: Json) => r.message_id));

  let imported = 0;
  for (const id of ids.filter((x) => !seen.has(x))) {
    const m = await messageWithPdfs(owner, id);
    const candidates = (byEmail.get(m.email) ?? []).filter((c) => !(c.tender.offers ?? []).some((o: Json) => o.contact_id === c.contact.id));
    // Zuerst merken, damit eine fehlerhafte Mail nicht in jedem Takt erneut verarbeitet wird.
    must(await admin.from("gmail_imports").insert({ owner_id: owner, message_id: id }));
    if (!candidates.length || !m.pdfs.length) continue;

    // Ausschreibung wählen: Titelwort im Betreff, sonst die jüngste
    const subject = m.subject.toLowerCase();
    const match = candidates.find((c) => c.tender.title.toLowerCase().split(/\s+/).some((w: string) => w.length > 3 && subject.includes(w)))
      ?? candidates.sort((a, b) => b.tender.created_at.localeCompare(a.tender.created_at))[0];
    const { tender, contact } = match;

    const pdf = m.pdfs[0];
    const bytes = await attachmentBytes(owner, id, pdf.attachmentId);
    const safeName = pdf.filename.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${owner}/${tender.project_id}/${Date.now()}-${safeName}`;
    const up = await admin.storage.from("files").upload(path, bytes, { contentType: "application/pdf" });
    if (up.error) throw new Error(up.error.message);
    const file = must(await admin.from("files").insert({
      owner_id: owner, project_id: tender.project_id, kind: "angebot", storage_path: path, name: pdf.filename,
      mime: "application/pdf", size: bytes.length, caption: `Angebot ${company(contact)} – ${tender.title}`,
    }).select("id").single());

    let x: Json | null = null;
    try { x = await extractOffer(owner, file.id, tender.id); } catch (e) { console.warn("Angebot nicht auslesbar:", (e as Error).message); }
    const offer = must(await admin.from("offers").insert({
      owner_id: owner, tender_id: tender.id, contact_id: contact.id, source: "gmail", file_id: file.id,
      valid_until: x?.valid_until ?? null, delivery_weeks: x?.delivery_weeks ?? null,
      discount_pct: x?.discount_pct ?? 0, extra_costs: x?.extra_costs ?? 0,
      notes: x ? x.notes : "Automatisch aus Gmail übernommen – Preise bitte manuell eintragen.",
    }).select("id").single());
    const positions = new Set(must(await admin.from("tender_positions").select("id").eq("tender_id", tender.id)).map((p: Json) => p.id));
    const prices = (x?.prices ?? []).filter((p: Json) => positions.has(p.position_id))
      .map((p: Json) => ({ owner_id: owner, offer_id: offer.id, position_id: p.position_id, unit_price: p.unit_price }));
    if (prices.length) must(await admin.from("offer_prices").insert(prices));
    must(await admin.from("gmail_imports").update({ tender_id: tender.id, offer_id: offer.id }).eq("owner_id", owner).eq("message_id", id));
    tender.offers = [...(tender.offers ?? []), { contact_id: contact.id }];

    await deliver(owner, `📥 Neues Angebot von ${company(contact)} für „${tender.title}“ (${tender.projects?.name ?? ""}) aus Gmail übernommen` +
      (prices.length ? ` – ${prices.length} Positionen ausgelesen. Der Preisspiegel ist aktualisiert.` : ". Die Preise konnte ich nicht auslesen, bitte kurz eintragen."));
    imported++;
  }
  return imported;
}

// ---------------------------------------------------------------- Nachfassen

async function mailText(owner: string, instruction: string, fallback: string, signature?: string | null) {
  let text: string;
  try {
    text = await compose(owner, `${instruction}\nGib nur den E-Mail-Text aus (Anrede bis Gruß), ohne Betreffzeile und ohne Signatur.`);
  } catch {
    text = fallback;
  }
  return signature ? `${text}\n\n${signature}` : text;
}

/** Einen Tag vor der Angebotsfrist: Bieter ohne Angebot erinnern. Bei überfälligen Mängeln: Handwerker erinnern. */
export async function followUps(owner: string, profile: Json, deliver: Deliver) {
  const tz = profile.timezone || "Europe/Vienna";
  const local = localNow(tz);
  if (local.time < "08:00" || local.time > "18:00") return 0;
  const google = !!(await getConnector(owner, "google"))?.secrets.refresh_token;
  const sender = profile.user_name || profile.company_name || "";
  let count = 0;

  // Angebotsfristen morgen
  const tenders = must(await admin.from("tenders")
    .select("id, title, deadline, projects(name), tender_bidders(contact_id, followup_at, contacts(email, company, name)), offers(contact_id)")
    .eq("owner_id", owner).eq("status", "versendet").eq("deadline", addDays(local.date, 1)));
  for (const t of tenders) {
    const answered = new Set((t.offers ?? []).map((o: Json) => o.contact_id));
    const open = (t.tender_bidders ?? []).filter((b: Json) => !answered.has(b.contact_id) && !b.followup_at);
    if (!open.length) continue;
    const drafted: string[] = [];
    for (const b of open) {
      if (google && b.contacts?.email) {
        const body = await mailText(owner,
          `Schreibe eine kurze, freundliche Erinnerung an ${company(b.contacts)}: Die Angebotsfrist für „${t.title}“ (Projekt ${t.projects?.name ?? ""}) endet morgen, ${dateDE(t.deadline, tz)}. Bitte um Zusendung des Angebots oder kurze Rückmeldung, falls sie nicht anbieten. Absender: ${sender}.`,
          `Guten Tag,\n\nkurze Erinnerung: Die Angebotsfrist für „${t.title}“ endet morgen, ${dateDE(t.deadline, tz)}. Wir freuen uns auf Ihr Angebot – oder eine kurze Nachricht, falls Sie nicht anbieten möchten.\n\nVielen Dank und freundliche Grüße\n${sender}`,
          profile.email_signature);
        await createDraft(owner, { to: b.contacts.email, subject: `Erinnerung: Angebotsfrist ${t.title} morgen`, body });
        drafted.push(company(b.contacts));
      }
      must(await admin.from("tender_bidders").update({ followup_at: new Date().toISOString() }).eq("tender_id", t.id).eq("contact_id", b.contact_id));
    }
    const names = open.map((b: Json) => company(b.contacts)).join(", ");
    await deliver(owner, `📨 Morgen endet die Angebotsfrist für „${t.title}“ (${t.projects?.name ?? ""}). Noch kein Angebot von: ${names}.` +
      (drafted.length ? `\nIch habe ${drafted.length === 1 ? "einen Erinnerungs-Entwurf" : `${drafted.length} Erinnerungs-Entwürfe`} in Gmail angelegt – kurz prüfen und senden.` : google ? "" : "\nVerbinde Google, dann lege ich die Erinnerungsmails automatisch an."));
    count++;
  }

  // Mängel mit überschrittener Frist
  const defects = must(await admin.from("defects")
    .select("id, title, location, due_date, projects(name, address), contacts(email, company, name)")
    .eq("owner_id", owner).eq("status", "offen").is("followup_at", null).lt("due_date", local.date));
  for (const d of defects) {
    let drafted = false;
    if (google && d.contacts?.email) {
      const body = await mailText(owner,
        `Schreibe eine höfliche, bestimmte Erinnerung an ${company(d.contacts)}: Der Mangel „${d.title}“${d.location ? ` (${d.location})` : ""} im Projekt ${d.projects?.name ?? ""}${d.projects?.address ? `, ${d.projects.address}` : ""} sollte bis ${dateDE(d.due_date, tz)} behoben sein und ist noch offen. Bitte um Terminvorschlag zur Behebung innerhalb der nächsten Tage. Absender: ${sender}.`,
        `Guten Tag,\n\nder Mangel „${d.title}“${d.location ? ` (${d.location})` : ""} im Projekt ${d.projects?.name ?? ""} sollte bis ${dateDE(d.due_date, tz)} behoben sein und ist noch offen. Bitte nennen Sie uns kurzfristig einen Termin zur Behebung.\n\nVielen Dank und freundliche Grüße\n${sender}`,
        profile.email_signature);
      await createDraft(owner, { to: d.contacts.email, subject: `Mangelbehebung: ${d.title} – ${d.projects?.name ?? ""}`, body });
      drafted = true;
    }
    must(await admin.from("defects").update({ followup_at: new Date().toISOString() }).eq("id", d.id));
    await deliver(owner, `🔧 Mangel überfällig: „${d.title}“ (${d.projects?.name ?? ""}), Frist war ${dateDE(d.due_date, tz)}${d.contacts ? `, zuständig ${company(d.contacts)}` : ""}.` +
      (drafted ? "\nEine Erinnerungsmail liegt als Entwurf in Gmail." : ""));
    count++;
  }
  return count;
}
