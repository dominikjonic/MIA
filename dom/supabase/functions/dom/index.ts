// DOM – Server-Funktion. Ein Einstiegspunkt mit Routen:
//   App (Bearer-Login):  /assistant, /compose, /extract, /connectors/*, /google/*, /visualize, /whatsapp/test
//   Öffentlich:          /whatsapp/webhook, /google/callback, /ics/<token> (Kalender-Abo), /approval/<token> (Kunden-Freigabe),
//                        /tick (Cron-Geheimnis), /bridge/* (Brücken-Token)
import { SUPABASE_URL, admin, getProfile, internalSetting, must, userFromRequest } from "./db.ts";
import { AIUnavailable, askAssistant, compose, logExchange, testClaude } from "./ai.ts";
import { getConnector, getSecrets, saveConnector, setStatus } from "./connectors.ts";
import { authUrl, createDraft, handleCallback, sendMail, testGoogle, todaysCalendar, upsertCalendarEvent } from "./google.ts";
import { extractInvoice, extractOffer } from "./extract.ts";
import { icsFeed } from "./ics.ts";
import { parseWebhook, sendWhatsApp, storeInboundMedia, testWhatsApp, verifyWebhook } from "./whatsapp.ts";
import { startVisualization, testHiggsfield } from "./higgsfield.ts";
import { handleBridge } from "./bridge.ts";
import { testMcp } from "./mcp.ts";
import { deliver, tick } from "./tick.ts";
import { decideApproval, getApproval } from "./approvals.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dom-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error("Hintergrundfehler:", e));
  try { EdgeRuntime.waitUntil(guarded); } catch { /* lokal ohne EdgeRuntime */ }
}

// ---------------------------------------------------------------- WhatsApp eingehend

async function handleInbound(raw: string, signature: string | null) {
  for (const m of await parseWebhook(raw, signature)) {
    let text = m.text;
    let context = "";
    if (m.mediaId) {
      const fileId = await storeInboundMedia(m.owner, m.mediaId, m.mime, m.text);
      context = `Per WhatsApp empfangene Datei (${m.type === "image" ? "Foto" : "Dokument"}), Datei-ID ${fileId}. Ordne sie mit doku_eintrag dem passenden Projekt zu.`;
      text = m.text || "(Foto ohne Text)";
    } else if (m.type === "audio") {
      await sendWhatsApp(m.owner, "Sprachnachrichten kann ich noch nicht verstehen – schreib mir bitte kurz.");
      continue;
    }
    if (!text) continue;
    let reply: string;
    try {
      reply = (await askAssistant(m.owner, text, "whatsapp", context)).reply;
    } catch (e) {
      reply = e instanceof AIUnavailable ? e.message : `Fehler: ${(e as Error).message}`;
    }
    await logExchange(m.owner, "whatsapp", text, reply);
    await sendWhatsApp(m.owner, reply);
  }
}

// ---------------------------------------------------------------- Konnektor-Test

async function testConnector(owner: string, id: string) {
  const c = must(await admin.from("connectors").select("*").eq("id", id).eq("owner_id", owner).single());
  try {
    let msg: string;
    if (c.mode === "mcp") msg = await testMcp(c.config.url, (await getSecrets(c.id)).token);
    else if (c.kind === "claude") msg = await testClaude(owner);
    else if (c.kind === "whatsapp") msg = await testWhatsApp(owner);
    else if (c.kind === "google") msg = await testGoogle(owner);
    else if (c.kind === "higgsfield") msg = await testHiggsfield(owner);
    else if (c.kind === "bridge" || c.mode === "bridge") {
      const bridge = await getConnector(owner, "bridge");
      const seen = bridge?.config.last_seen ? new Date(bridge.config.last_seen).getTime() : 0;
      if (Date.now() - seen > 3 * 60 * 1000) throw new Error("Die Desktop-Brücke hat sich in den letzten Minuten nicht gemeldet. Läuft sie auf deinem Rechner?");
      msg = `Desktop-Brücke aktiv (${(bridge!.config.programs ?? []).join(", ") || "bereit"})`;
    } else throw new Error("Für diesen Konnektor gibt es keinen Test.");
    await setStatus(c.id, "verbunden", msg);
    return { ok: true, message: msg };
  } catch (e) {
    await setStatus(c.id, "fehler", (e as Error).message);
    return { ok: false, message: (e as Error).message };
  }
}

// ---------------------------------------------------------------- Router

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/dom(?=\/|$)/, "") || "/";

  try {
    // ---------- öffentliche Routen
    if (path === "/whatsapp/webhook") {
      if (req.method === "GET") return await verifyWebhook(url);
      const raw = await req.text();
      background(handleInbound(raw, req.headers.get("X-Hub-Signature-256")));
      return new Response("OK", { status: 200 });
    }
    if (path === "/google/callback") return await handleCallback(url);
    const ics = path.match(/^\/ics\/([0-9a-f]{20,})(?:\.ics)?$/);
    if (ics) return await icsFeed(ics[1]);
    const approval = path.match(/^\/approval\/([0-9a-f]{20,})$/);
    if (approval) {
      if (req.method === "GET") {
        const a = await getApproval(approval[1]);
        return a ? json(a) : json({ error: "Freigabe nicht gefunden" }, 404);
      }
      const r = await decideApproval(approval[1], await req.json().catch(() => ({})), deliver);
      return json(r, r.status);
    }
    if (path === "/tick") {
      if (req.headers.get("x-cron-secret") !== (await internalSetting("cron_secret"))) return json({ error: "Forbidden" }, 403);
      background(tick().then((r) => console.log("tick:", r)));
      return json({ ok: true });
    }
    if (path.startsWith("/bridge/")) {
      const res = await handleBridge(req, path);
      for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
      return res;
    }

    // ---------- App-Routen (angemeldet)
    const owner = await userFromRequest(req);
    if (!owner) return json({ error: "Nicht angemeldet" }, 401);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    switch (path) {
      case "/assistant": {
        const message = String(body.message ?? "").trim();
        if (!message) return json({ error: "Leere Nachricht" }, 400);
        try {
          const r = await askAssistant(owner, message, "app", body.context ?? "");
          await logExchange(owner, "app", message, r.reply, { tools: r.tools_used });
          return json(r);
        } catch (e) {
          if (e instanceof AIUnavailable) return json({ reply: e.message, tools_used: [], setup_needed: true });
          throw e;
        }
      }
      case "/compose":
        return json({ text: await compose(owner, String(body.instruction ?? "")) });

      case "/connectors/save":
        return json(await saveConnector(owner, body));
      case "/connectors/test":
        return json(await testConnector(owner, body.id));
      case "/connectors/bridge-token": {
        const c = await getConnector(owner, "bridge");
        return json({ token: c?.secrets.token ?? null });
      }
      case "/connectors/info":
        return json({
          whatsapp_webhook: `${SUPABASE_URL}/functions/v1/dom/whatsapp/webhook`,
          google_redirect: `${SUPABASE_URL}/functions/v1/dom/google/callback`,
          bridge_url: `${SUPABASE_URL}/functions/v1/dom`,
        });

      case "/google/auth-url":
        return json({ url: await authUrl(owner, String(body.return_to ?? url.searchParams.get("return_to") ?? "")) });
      case "/google/draft":
        return json(await createDraft(owner, body));
      case "/google/send":
        return json(await sendMail(owner, body));
      case "/google/calendar":
        return json(await upsertCalendarEvent(owner, body.appointment_id));
      case "/google/events": {
        if (!(await getConnector(owner, "google"))?.secrets.refresh_token) return json({ events: [] });
        return json({ events: await todaysCalendar(owner, body.from, body.to) });
      }

      case "/extract":
        if (body.kind === "offer") return json(await extractOffer(owner, body.file_id, body.tender_id));
        if (body.kind === "invoice") return json(await extractInvoice(owner, body.file_id, body.project_id));
        return json({ error: "Unbekannte Art" }, 400);

      case "/visualize":
        return json(await startVisualization(owner, body.project_id, body.prompt, body.image_url));

      case "/whatsapp/test": {
        const profile = await getProfile(owner);
        const r = await sendWhatsApp(owner, body.text || `Hallo ${profile.user_name ?? ""}! DOM ist jetzt mit WhatsApp verbunden. Schreib mir z. B. „Was steht heute an?“`);
        return json(r, r.ok ? 200 : 400);
      }
    }
    return json({ error: "Unbekannter Pfad" }, 404);
  } catch (e) {
    console.error(path, e);
    return json({ error: (e as Error).message }, 500);
  }
});
