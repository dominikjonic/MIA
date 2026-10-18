// Google Workspace: OAuth, Gmail (Entwürfe, Senden, Suche) und Kalender.
import { FUNCTION_URL, admin, internalSetting, must } from "./db.ts";
import { getConnector, mergeSecrets, setStatus } from "./connectors.ts";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export const GOOGLE_REDIRECT = `${FUNCTION_URL}/google/callback`;

async function sign(value: string) {
  const secret = await internalSetting("cron_secret");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, "");
}

export async function authUrl(owner: string, returnTo: string) {
  const c = await getConnector(owner, "google");
  if (!c?.config.client_id) throw new Error("Bitte zuerst Client-ID und Client-Secret eintragen.");
  const payload = btoa(JSON.stringify({ o: owner, r: returnTo }));
  const state = `${payload}.${await sign(payload)}`;
  const params = new URLSearchParams({
    client_id: c.config.client_id, redirect_uri: GOOGLE_REDIRECT, response_type: "code",
    scope: SCOPES.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(url: URL): Promise<Response> {
  const [payload, sig] = (url.searchParams.get("state") ?? "").split(".");
  if (!payload || sig !== (await sign(payload))) return new Response("Ungültiger Status", { status: 400 });
  const { o: owner, r: returnTo } = JSON.parse(atob(payload));
  const back = (status: string) => Response.redirect(`${returnTo || "/"}#/einstellungen/konnektoren?google=${status}`, 302);
  const code = url.searchParams.get("code");
  if (!code) return back("abgebrochen");

  const c = await getConnector(owner, "google");
  if (!c) return back("fehler");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: c.config.client_id, client_secret: c.secrets.client_secret ?? "",
      redirect_uri: GOOGLE_REDIRECT, grant_type: "authorization_code",
    }),
  });
  const tok = await res.json();
  if (!res.ok) {
    await setStatus(c.id, "fehler", tok.error_description || tok.error || "Anmeldung fehlgeschlagen");
    return back("fehler");
  }
  await mergeSecrets(c.id, owner, {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? c.secrets.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
  const email = tok.id_token ? JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email : null;
  must(await admin.from("connectors").update({ config: { ...c.config, email } }).eq("id", c.id));
  await setStatus(c.id, "verbunden", email ? `Verbunden als ${email}` : "Verbunden");
  return back("verbunden");
}

async function accessToken(owner: string): Promise<string> {
  const c = await getConnector(owner, "google");
  if (!c?.secrets.refresh_token) throw new Error("Google ist nicht verbunden.");
  if (c.secrets.access_token && c.secrets.expires_at > Date.now()) return c.secrets.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.config.client_id, client_secret: c.secrets.client_secret, refresh_token: c.secrets.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tok = await res.json();
  if (!res.ok) {
    await setStatus(c.id, "fehler", "Anmeldung abgelaufen – bitte neu verbinden.");
    throw new Error("Google-Anmeldung abgelaufen – bitte in Konnektoren neu verbinden.");
  }
  await mergeSecrets(c.id, owner, { access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000 });
  return tok.access_token;
}

async function gapi(owner: string, url: string, init: RequestInit = {}) {
  const token = await accessToken(owner);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Google-Fehler ${res.status}`);
  return body;
}

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeader(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
}

function mime(to: string, subject: string, body: string, cc?: string) {
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function createDraft(owner: string, mail: { to: string; subject: string; body: string; cc?: string }) {
  const res = await gapi(owner, "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST", body: JSON.stringify({ message: { raw: b64url(mime(mail.to, mail.subject, mail.body, mail.cc)) } }),
  });
  return { draft_id: res.id as string, link: "https://mail.google.com/mail/u/0/#drafts" };
}

export async function sendMail(owner: string, mail: { to: string; subject: string; body: string; cc?: string }) {
  const res = await gapi(owner, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", body: JSON.stringify({ raw: b64url(mime(mail.to, mail.subject, mail.body, mail.cc)) }),
  });
  return { message_id: res.id as string };
}

export async function searchMail(owner: string, query: string, max = 8) {
  const list = await gapi(owner, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`);
  const out = [];
  for (const m of list.messages ?? []) {
    const msg = await gapi(owner, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    const h = Object.fromEntries((msg.payload?.headers ?? []).map((x: any) => [x.name, x.value]));
    out.push({ id: m.id, from: h.From, subject: h.Subject, date: h.Date, snippet: msg.snippet, has_attachment: (msg.payload?.mimeType ?? "").startsWith("multipart/mixed") });
  }
  return out;
}

export async function upsertCalendarEvent(owner: string, appointmentId: string) {
  const a = must(await admin.from("appointments").select("*, projects(name)").eq("id", appointmentId).eq("owner_id", owner).single());
  const end = a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 60 * 60 * 1000).toISOString();
  const event = {
    summary: a.projects?.name ? `${a.title} – ${a.projects.name}` : a.title,
    location: a.location ?? undefined,
    description: a.notes ?? undefined,
    start: { dateTime: a.starts_at },
    end: { dateTime: end },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: a.remind_minutes ?? 60 }] },
  };
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const res = a.google_event_id
    ? await gapi(owner, `${base}/${a.google_event_id}`, { method: "PUT", body: JSON.stringify(event) })
    : await gapi(owner, base, { method: "POST", body: JSON.stringify(event) });
  must(await admin.from("appointments").update({ google_event_id: res.id }).eq("id", a.id));
  return { event_id: res.id, link: res.htmlLink };
}

export async function todaysCalendar(owner: string, dayStartIso: string, dayEndIso: string) {
  const res = await gapi(owner, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(dayStartIso)}&timeMax=${encodeURIComponent(dayEndIso)}`);
  return (res.items ?? []).map((e: any) => ({ title: e.summary, start: e.start?.dateTime ?? e.start?.date, location: e.location }));
}

export async function testGoogle(owner: string) {
  const info = await gapi(owner, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  return `Verbunden als ${info.emailAddress}`;
}
