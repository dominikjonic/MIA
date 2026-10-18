// KI-Assistent (Claude) – gleiche Logik für App-Chat, WhatsApp und Tagesbriefing.
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { admin, getProfile, localNow, must } from "./db.ts";
import { getConnector, mcpServersFor } from "./connectors.ts";
import { TOOLS, runTool } from "./tools.ts";

const DEFAULT_MODEL = "claude-opus-5-5";

const SYSTEM = `Du bist der Assistent in „DOM“, der Projektsoftware eines Büroplaners für Büromöblierung und Umzugskoordination in Österreich.
Du hilfst beim Organisieren: Projekte, Phasen (Naturmaß, Konzept/Entwurf, Planung, Trockenbau, Möblierung, Visualisierung, Ausschreibung, Angebotsvergleich, Vergabe, Terminierung, Umzug, Projektüberwachung), Budget, Angebote, Termine, Erinnerungen, E-Mails.

Arbeitsweise:
- Hol dir Fakten immer über die Werkzeuge, erfinde keine Zahlen, Termine oder Kontakte.
- Wenn der Benutzer etwas erledigt meldet („Aufmaß bei Müller gemacht“), markiere die passende Aufgabe als erledigt und lege bei Bedarf einen Doku-Eintrag an.
- Wenn Fotos empfangen wurden, ordne sie per doku_eintrag dem richtigen Projekt zu (frag nach, wenn unklar).
- Budget: weise aktiv auf Überschreitungen hin und schlage Gegenmaßnahmen vor (Alternativangebot, Nachverhandeln, Reserve).
- Angebotsvergleich: achte auf Vollständigkeit, Lieferzeit, Rabatte und Nebenkosten, nicht nur auf den Preis; gib eine klare Empfehlung mit Begründung.
- E-Mails: formuliere geschäftlich, freundlich, in Sie-Form, österreichisches Deutsch. Speichere sie als Gmail-Entwurf; senden nur nach ausdrücklicher Bestätigung.
- Visualisierungs-Prompts schreibst du auf Englisch, fotorealistisch, mit Raumtyp, Möbeln, Materialien, Licht und Kameraperspektive.
- Antworte kurz und konkret auf Deutsch (du-Form gegenüber dem Benutzer). Listen mit „•“, keine Tabellen, keine Überschriften mit #. Daten als „Mo., 20. Okt.“, Beträge als „12.500 €“.
- Bei WhatsApp: maximal ca. 1200 Zeichen, das Wichtigste zuerst.`;

export type AssistantResult = { reply: string; tools_used: string[] };

export class AIUnavailable extends Error {}

async function clientFor(owner: string) {
  const c = await getConnector(owner, "claude");
  if (!c?.secrets.api_key) throw new AIUnavailable("Die KI ist noch nicht eingerichtet. Trage unter Einstellungen → Konnektoren → Claude einen API-Schlüssel ein.");
  return {
    client: new Anthropic({ apiKey: c.secrets.api_key, maxRetries: 2, timeout: 120_000 }),
    model: (c.config.model as string) || DEFAULT_MODEL,
    effort: (c.config.effort as "low" | "medium" | "high") || "medium",
  };
}

/** Verlauf der letzten Nachrichten (App und WhatsApp gemeinsam), älteste zuerst, abwechselnd user/assistant. */
async function history(owner: string, limit = 16): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = must(await admin.from("messages").select("role, content").eq("owner_id", owner).neq("channel", "system")
    .order("created_at", { ascending: false }).limit(limit)).reverse();
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.role === r.role) last.content = `${last.content}\n\n${r.content}`;
    else out.push({ role: r.role, content: r.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export async function askAssistant(owner: string, text: string, channel: "app" | "whatsapp" | "system", extraContext = ""): Promise<AssistantResult> {
  const { client, model, effort } = await clientFor(owner);
  const profile = await getProfile(owner);
  const now = localNow(profile.timezone || "Europe/Vienna");
  const mcpServers = await mcpServersFor(owner);

  const prior = channel === "system" ? [] : await history(owner);
  const userContent = `[${now.weekday}, ${now.date}, ${now.time} Uhr · Kanal: ${channel}${profile.user_name ? ` · Benutzer: ${profile.user_name}` : ""}${profile.company_name ? ` · Firma: ${profile.company_name}` : ""}]${extraContext ? `\n${extraContext}` : ""}\n\n${text}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [...prior, { role: "user", content: userContent }];

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...TOOLS,
    ...mcpServers.map((s) => ({ type: "mcp_toolset" as const, mcp_server_name: s.name })),
  ];
  const betas = ["server-side-fallback-2026-07-01", ...(mcpServers.length ? ["mcp-client-2025-11-20"] : [])];
  const used: string[] = [];

  for (let round = 0; round < 10; round++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas,
      fallbacks: "default",
      output_config: { effort },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools,
      ...(mcpServers.length ? { mcp_servers: mcpServers } : {}),
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "Dazu kann ich leider nichts sagen. Formuliere die Anfrage bitte anders.", tools_used: used };
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const reply = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: reply || "Erledigt.", tools_used: used };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(toolUses.map(async (t) => {
      used.push(t.name);
      try {
        const out = await runTool(owner, t.name, (t.input ?? {}) as Record<string, unknown>);
        return { type: "tool_result" as const, tool_use_id: t.id, content: out };
      } catch (e) {
        return { type: "tool_result" as const, tool_use_id: t.id, content: (e as Error).message, is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  return { reply: "Das war zu umfangreich für einen Schritt. Teile die Anfrage bitte auf.", tools_used: used };
}

/** Einmalige Textaufgabe ohne Werkzeuge (z. B. E-Mail-Text oder Visualisierungs-Prompt aus der App). */
export async function compose(owner: string, instruction: string): Promise<string> {
  const { client, model } = await clientFor(owner);
  const response = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: instruction }],
  });
  if (response.stop_reason === "refusal") throw new Error("Die KI hat diese Anfrage abgelehnt.");
  return response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function testClaude(owner: string) {
  const { client, model } = await clientFor(owner);
  const m = await client.models.retrieve(model);
  return `Verbunden – Modell ${m.display_name}`;
}

/** Speichert einen Austausch im gemeinsamen Verlauf. */
export async function logExchange(owner: string, channel: "app" | "whatsapp" | "system", user: string, reply: string, meta: Record<string, unknown> = {}) {
  // Eigene Zeitstempel, damit die Frage im Verlauf sicher vor der Antwort steht
  const now = Date.now();
  must(await admin.from("messages").insert([
    { owner_id: owner, channel, role: "user", content: user, created_at: new Date(now - 1).toISOString() },
    { owner_id: owner, channel, role: "assistant", content: reply, meta, created_at: new Date(now).toISOString() },
  ]));
}
