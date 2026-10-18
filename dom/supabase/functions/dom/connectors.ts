// Konnektoren: Einstellungen (config) liegen in public.connectors, Geheimnisse in public.connector_secrets.
// Geheimnisse verlassen den Server nie – die App sieht nur has_secret.
import { admin, must } from "./db.ts";

export type Connector = {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  mode: string;
  config: Record<string, any>;
  enabled: boolean;
  status: string;
};

export type ConnectorWithSecrets = Connector & { secrets: Record<string, any> };

export const KINDS = ["claude", "whatsapp", "google", "higgsfield", "blender", "sketchup", "autocad", "bridge", "mcp"];

export async function getConnector(owner: string, kind: string): Promise<ConnectorWithSecrets | null> {
  const rows = must(await admin.from("connectors").select("*").eq("owner_id", owner).eq("kind", kind)
    .eq("enabled", true).order("created_at").limit(1));
  if (!rows.length) return null;
  return { ...rows[0], secrets: await getSecrets(rows[0].id) };
}

export async function listConnectors(owner: string): Promise<ConnectorWithSecrets[]> {
  const rows = must(await admin.from("connectors").select("*").eq("owner_id", owner).eq("enabled", true));
  return Promise.all(rows.map(async (r: Connector) => ({ ...r, secrets: await getSecrets(r.id) })));
}

export async function getSecrets(connectorId: string): Promise<Record<string, any>> {
  const { data } = await admin.from("connector_secrets").select("secrets").eq("connector_id", connectorId).maybeSingle();
  return data?.secrets ?? {};
}

export async function mergeSecrets(connectorId: string, owner: string, patch: Record<string, any>) {
  const current = await getSecrets(connectorId);
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") delete next[k];
    else next[k] = v;
  }
  must(await admin.from("connector_secrets").upsert({
    connector_id: connectorId, owner_id: owner, secrets: next, updated_at: new Date().toISOString(),
  }));
  must(await admin.from("connectors").update({ has_secret: Object.keys(next).length > 0 }).eq("id", connectorId));
}

export async function setStatus(id: string, status: "verbunden" | "fehler" | "unbekannt", message: string) {
  must(await admin.from("connectors").update({
    status, status_message: message.slice(0, 500), last_checked_at: new Date().toISOString(),
  }).eq("id", id));
}

function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Anlegen/Ändern eines Konnektors aus der App. Leere Geheimnis-Felder lassen bestehende Werte unverändert. */
export async function saveConnector(owner: string, input: {
  id?: string; kind: string; name?: string; mode?: string; config?: Record<string, any>;
  secrets?: Record<string, any>; enabled?: boolean;
}) {
  if (!KINDS.includes(input.kind)) throw new Error(`Unbekannter Konnektor: ${input.kind}`);
  const config = { ...(input.config ?? {}) };
  // WhatsApp braucht ein Verify-Token für den Webhook – wird einmalig erzeugt.
  if (input.kind === "whatsapp" && !config.verify_token) config.verify_token = randomToken(12);

  let id = input.id;
  if (id) {
    must(await admin.from("connectors").update({
      name: input.name, mode: input.mode, config, enabled: input.enabled ?? true,
    }).eq("id", id).eq("owner_id", owner));
  } else {
    const row = must(await admin.from("connectors").insert({
      owner_id: owner, kind: input.kind, name: input.name || input.kind, mode: input.mode || "api",
      config, enabled: input.enabled ?? true,
    }).select("id").single());
    id = row.id;
  }
  const secrets = Object.fromEntries(Object.entries(input.secrets ?? {}).filter(([, v]) => v !== undefined && v !== ""));
  if (input.kind === "bridge" && !(await getSecrets(id!)).token) secrets.token = randomToken();
  if (Object.keys(secrets).length) await mergeSecrets(id!, owner, secrets);
  return { id };
}

/** Bridge-Token für die Anzeige in den Einstellungen (nur der Besitzer selbst). */
export async function revealBridgeToken(owner: string): Promise<string | null> {
  const c = await getConnector(owner, "bridge");
  return c?.secrets.token ?? null;
}

export async function ownerByBridgeToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await admin.from("connector_secrets").select("owner_id").eq("secrets->>token", token).maybeSingle();
  return data?.owner_id ?? null;
}

/** MCP-Server für Claude: alle aktivierten Konnektoren im MCP-Modus mit erreichbarer URL. */
export async function mcpServersFor(owner: string) {
  const all = await listConnectors(owner);
  return all
    .filter((c) => c.mode === "mcp" && typeof c.config.url === "string" && c.config.url.startsWith("https://"))
    .map((c) => ({
      type: "url" as const,
      name: `${c.kind}-${c.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60),
      url: c.config.url as string,
      ...(c.secrets.token ? { authorization_token: c.secrets.token as string } : {}),
    }));
}
