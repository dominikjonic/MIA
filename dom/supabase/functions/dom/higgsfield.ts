// Higgsfield-Visualisierungen. Host, Modellpfad und Format sind im Konnektor einstellbar,
// weil Higgsfield Endpunkte und Modelle regelmäßig erweitert.
import { admin, must } from "./db.ts";
import { ConnectorWithSecrets, getConnector, setStatus } from "./connectors.ts";

function settings(c: ConnectorWithSecrets) {
  return {
    base: String(c.config.base_url || "https://platform.higgsfield.ai").replace(/\/$/, ""),
    model: String(c.config.model_path || "higgsfield-ai/soul/standard").replace(/^\//, ""),
    aspect: c.config.aspect_ratio || "16:9",
    resolution: c.config.resolution || "1080p",
    auth: c.secrets.api_secret ? `Key ${c.secrets.api_key}:${c.secrets.api_secret}` : `Key ${c.secrets.api_key}`,
  };
}

function pickImage(body: any): string | null {
  return body?.images?.[0]?.url ?? body?.output?.images?.[0]?.url ?? body?.result?.url ?? body?.image?.url ??
    body?.output?.[0]?.url ?? body?.jobs?.[0]?.results?.raw?.url ?? null;
}

export async function startVisualization(owner: string, projectId: string, prompt: string, imageUrl?: string) {
  const c = await getConnector(owner, "higgsfield");
  if (!c?.secrets.api_key) throw new Error("Higgsfield ist nicht eingerichtet (Konnektoren → Higgsfield).");
  const s = settings(c);
  must(await admin.from("projects").select("id").eq("id", projectId).eq("owner_id", owner).single());
  const viz = must(await admin.from("visualizations").insert({
    owner_id: owner, project_id: projectId, prompt, status: "laeuft",
  }).select("id").single());

  const res = await fetch(`${s.base}/${s.model}`, {
    method: "POST",
    headers: { Authorization: s.auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ prompt, aspect_ratio: s.aspect, resolution: s.resolution, ...(imageUrl ? { image_url: imageUrl } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.detail || body?.message || body?.error || `Higgsfield-Fehler ${res.status}`;
    must(await admin.from("visualizations").update({ status: "fehler", error: String(msg) }).eq("id", viz.id));
    await setStatus(c.id, "fehler", String(msg));
    throw new Error(String(msg));
  }
  const direct = pickImage(body);
  must(await admin.from("visualizations").update({
    request_id: body.request_id ?? body.id ?? null,
    status: direct ? "fertig" : "laeuft",
    result_url: direct,
  }).eq("id", viz.id));
  if (direct) await saveResult(owner, projectId, viz.id, direct);
  return { id: viz.id as string, status: direct ? "fertig" : "laeuft" };
}

/** Fragt laufende Aufträge ab (vom Minuten-Takt aufgerufen). */
export async function pollVisualizations() {
  const pending = must(await admin.from("visualizations").select("*").eq("status", "laeuft").not("request_id", "is", null).limit(20));
  for (const v of pending) {
    const c = await getConnector(v.owner_id, "higgsfield");
    if (!c) continue;
    const s = settings(c);
    const res = await fetch(`${s.base}/requests/${v.request_id}/status`, { headers: { Authorization: s.auth, Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    const status = String(body.status ?? "").toLowerCase();
    const url = pickImage(body);
    if (url && (status === "completed" || status === "succeeded" || status === "" || status === "done")) {
      must(await admin.from("visualizations").update({ status: "fertig", result_url: url }).eq("id", v.id));
      await saveResult(v.owner_id, v.project_id, v.id, url);
    } else if (["failed", "nsfw", "error", "canceled", "cancelled"].includes(status)) {
      must(await admin.from("visualizations").update({ status: "fehler", error: body.error ?? status }).eq("id", v.id));
    } else if (Date.now() - new Date(v.created_at).getTime() > 30 * 60 * 1000) {
      must(await admin.from("visualizations").update({ status: "fehler", error: "Zeitüberschreitung" }).eq("id", v.id));
    }
  }
}

/** Speichert das Ergebnisbild dauerhaft im Projekt (Higgsfield-Links laufen ab). */
async function saveResult(owner: string, projectId: string, vizId: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) return;
  const mime = res.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = `visualisierung-${vizId.slice(0, 8)}.${mime.includes("jpeg") ? "jpg" : mime.split("/")[1] ?? "png"}`;
  const path = `${owner}/${projectId}/${name}`;
  must(await admin.storage.from("files").upload(path, bytes, { contentType: mime, upsert: true }));
  must(await admin.from("files").insert({
    owner_id: owner, project_id: projectId, kind: "visualisierung", storage_path: path, name, mime, size: bytes.length,
    caption: "Higgsfield-Visualisierung",
  }));
}

export async function testHiggsfield(owner: string) {
  const c = await getConnector(owner, "higgsfield");
  if (!c?.secrets.api_key) throw new Error("API-Schlüssel fehlt.");
  const s = settings(c);
  // Statusabfrage einer unbekannten ID: 401/403 = Schlüssel falsch, 404/422 = Schlüssel gültig.
  const res = await fetch(`${s.base}/requests/00000000-0000-0000-0000-000000000000/status`, { headers: { Authorization: s.auth } });
  if (res.status === 401 || res.status === 403) throw new Error("Schlüssel wird von Higgsfield abgelehnt.");
  return `Erreichbar (${s.base}, Modell ${s.model})`;
}
