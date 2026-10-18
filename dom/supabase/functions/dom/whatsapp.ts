// WhatsApp Business Cloud API (Meta).
// Eingehend: Webhook → KI-Assistent. Ausgehend: Text; außerhalb des 24-h-Fensters optional per Vorlage.
import { admin, getProfile, must } from "./db.ts";
import { ConnectorWithSecrets, getConnector } from "./connectors.ts";

const GRAPH = "https://graph.facebook.com";

function digits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

async function graph(c: ConnectorWithSecrets, path: string, init: RequestInit = {}) {
  const version = c.config.api_version || "v21.0";
  const res = await fetch(`${GRAPH}/${version}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.secrets.access_token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `WhatsApp-Fehler ${res.status}`) as Error & { code?: number };
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

/** WhatsApp erlaubt formatierten Text nur eingeschränkt – Markdown-Überschriften entfernen, Fett beibehalten. */
function toWhatsAppText(text: string) {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .slice(0, 4000);
}

export async function sendWhatsApp(owner: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const c = await getConnector(owner, "whatsapp");
  if (!c || !c.secrets.access_token || !c.config.phone_number_id) return { ok: false, error: "WhatsApp ist nicht eingerichtet." };
  const profile = await getProfile(owner);
  const to = digits(profile.whatsapp_number);
  if (!to) return { ok: false, error: "In den Einstellungen fehlt deine WhatsApp-Nummer." };

  const body = toWhatsAppText(text);
  try {
    await graph(c, `${c.config.phone_number_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: false } }),
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error & { code?: number };
    // 131047: Nachricht außerhalb des 24-Stunden-Fensters → nur Vorlagen erlaubt
    if ((err.code === 131047 || err.code === 131026) && c.config.template_name) {
      try {
        await graph(c, `${c.config.phone_number_id}/messages`, {
          method: "POST",
          body: JSON.stringify({
            messaging_product: "whatsapp", to, type: "template",
            template: {
              name: c.config.template_name,
              language: { code: c.config.template_language || "de" },
              components: [{ type: "body", parameters: [{ type: "text", text: body.replace(/\s*\n\s*/g, " · ").slice(0, 1000) }] }],
            },
          }),
        });
        return { ok: true };
      } catch (e2) {
        return { ok: false, error: (e2 as Error).message };
      }
    }
    return { ok: false, error: err.message };
  }
}

export async function testWhatsApp(owner: string) {
  const c = await getConnector(owner, "whatsapp");
  if (!c) throw new Error("WhatsApp-Konnektor fehlt.");
  const info = await graph(c, `${c.config.phone_number_id}?fields=display_phone_number,verified_name`);
  return `Verbunden mit ${info.verified_name ?? ""} (${info.display_phone_number ?? c.config.phone_number_id})`;
}

// ---------------------------------------------------------------- Webhook

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meta-Verifizierung beim Einrichten des Webhooks (GET). */
export async function verifyWebhook(url: URL): Promise<Response> {
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const { data } = await admin.from("connectors").select("id").eq("kind", "whatsapp").eq("config->>verify_token", token).limit(1);
  if (url.searchParams.get("hub.mode") === "subscribe" && data?.length) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export type InboundMessage = {
  owner: string;
  from: string;
  type: string;
  text: string;
  mediaId?: string;
  mime?: string;
};

/** Prüft Signatur und Absender, liefert die eingehenden Nachrichten des Besitzers. */
export async function parseWebhook(raw: string, signature: string | null): Promise<InboundMessage[]> {
  const payload = JSON.parse(raw);
  const out: InboundMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId || !value.messages?.length) continue;
      const rows = must(await admin.from("connectors").select("id, owner_id").eq("kind", "whatsapp")
        .eq("config->>phone_number_id", phoneNumberId).eq("enabled", true).limit(1));
      if (!rows.length) continue;
      const owner = rows[0].owner_id as string;
      const c = await getConnector(owner, "whatsapp");
      if (!c) continue;
      if (c.secrets.app_secret) {
        const expected = "sha256=" + (await hmacHex(c.secrets.app_secret, raw));
        if (signature !== expected) {
          console.warn("WhatsApp-Signatur ungültig");
          continue;
        }
      }
      const profile = await getProfile(owner);
      for (const m of value.messages) {
        // Nur Nachrichten der eigenen Nummer werden verarbeitet.
        if (digits(m.from) !== digits(profile.whatsapp_number)) continue;
        const msg: InboundMessage = { owner, from: m.from, type: m.type, text: "" };
        if (m.type === "text") msg.text = m.text?.body ?? "";
        else if (m.type === "image" || m.type === "document") {
          const media = m[m.type];
          msg.mediaId = media?.id;
          msg.mime = media?.mime_type;
          msg.text = media?.caption ?? "";
        } else if (m.type === "interactive") msg.text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        else if (m.type === "button") msg.text = m.button?.text ?? "";
        out.push(msg);
      }
    }
  }
  return out;
}

/** Lädt ein per WhatsApp gesendetes Foto/Dokument in den Datei-Speicher (Eingang ohne Projekt). */
export async function storeInboundMedia(owner: string, mediaId: string, mime: string | undefined, caption: string) {
  const c = await getConnector(owner, "whatsapp");
  if (!c) throw new Error("WhatsApp-Konnektor fehlt.");
  const meta = await graph(c, mediaId);
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${c.secrets.access_token}` } });
  if (!res.ok) throw new Error("Medien-Download fehlgeschlagen");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = (mime ?? meta.mime_type ?? "application/octet-stream").split("/")[1]?.split(";")[0] ?? "bin";
  const name = `whatsapp-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  const path = `${owner}/eingang/${crypto.randomUUID()}-${name}`;
  must(await admin.storage.from("files").upload(path, bytes, { contentType: mime ?? meta.mime_type }));
  const file = must(await admin.from("files").insert({
    owner_id: owner, kind: (mime ?? "").startsWith("image/") ? "foto" : "dokument",
    storage_path: path, name, mime: mime ?? meta.mime_type, size: bytes.length, caption: caption || null,
  }).select("id").single());
  return file.id as string;
}
