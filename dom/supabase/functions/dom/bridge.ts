// Desktop-Brücke: kleines Programm auf dem Rechner des Benutzers, das Blender (über Blender-MCP),
// SketchUp (Erweiterung) und AutoCAD-Exporte mit DOM verbindet. Authentifizierung per X-DOM-Token.
import { admin, must } from "./db.ts";
import { getConnector, ownerByBridgeToken, setStatus } from "./connectors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Item = {
  name: string; quantity?: number; unit?: string; room?: string; category?: string;
  manufacturer?: string; article_no?: string; unit_price_est?: number; notes?: string;
};

async function importItems(owner: string, projectId: string, source: string, items: Item[], replace: boolean) {
  const project = must(await admin.from("projects").select("id").eq("id", projectId).eq("owner_id", owner).single());
  if (replace) must(await admin.from("items").delete().eq("project_id", project.id).eq("source", source));
  const rows = items.filter((i) => i.name).map((i, n) => ({
    owner_id: owner, project_id: project.id, name: String(i.name).slice(0, 200), quantity: Number(i.quantity ?? 1),
    unit: i.unit ?? "Stk", room: i.room ?? null, category: i.category ?? null, manufacturer: i.manufacturer ?? null,
    article_no: i.article_no ?? null, unit_price_est: i.unit_price_est ?? null, notes: i.notes ?? null, source, position: n,
  }));
  if (rows.length) must(await admin.from("items").insert(rows));
  return rows.length;
}

function decodeBase64(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function storeFile(owner: string, projectId: string | null, name: string, mime: string, b64: string, kind: string) {
  const bytes = decodeBase64(b64);
  const path = `${owner}/${projectId ?? "eingang"}/${crypto.randomUUID().slice(0, 8)}-${name}`;
  must(await admin.storage.from("files").upload(path, bytes, { contentType: mime }));
  const f = must(await admin.from("files").insert({
    owner_id: owner, project_id: projectId, kind, storage_path: path, name, mime, size: bytes.length,
  }).select("id").single());
  return f.id as string;
}

export async function handleBridge(req: Request, path: string): Promise<Response> {
  const owner = await ownerByBridgeToken(req.headers.get("X-DOM-Token") ?? "");
  if (!owner) return json({ error: "Ungültiges Token" }, 401);
  const bridge = await getConnector(owner, "bridge");

  if (path === "/bridge/ping") {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (bridge) {
      must(await admin.from("connectors").update({ config: { ...bridge.config, last_seen: new Date().toISOString(), programs: body.programs ?? bridge.config.programs } }).eq("id", bridge.id));
      await setStatus(bridge.id, "verbunden", `Aktiv auf ${body.hostname ?? "Rechner"}`);
    }
    return json({ ok: true });
  }

  if (path === "/bridge/projects") {
    const rows = must(await admin.from("projects").select("id, name").eq("owner_id", owner).eq("status", "aktiv").order("name"));
    return json({ projects: rows });
  }

  if (path === "/bridge/jobs" && req.method === "GET") {
    const targets = (new URL(req.url).searchParams.get("targets") ?? "blender,sketchup,autocad").split(",");
    const jobs = must(await admin.from("bridge_jobs").select("*").eq("owner_id", owner).eq("status", "offen").in("target", targets).order("created_at").limit(5));
    if (jobs.length) {
      must(await admin.from("bridge_jobs").update({ status: "laeuft", updated_at: new Date().toISOString() }).in("id", jobs.map((j: { id: string }) => j.id)));
    }
    return json({ jobs });
  }

  const jobMatch = path.match(/^\/bridge\/jobs\/([0-9a-f-]{36})$/);
  if (jobMatch && req.method === "POST") {
    const body = await req.json();
    const job = must(await admin.from("bridge_jobs").select("*").eq("id", jobMatch[1]).eq("owner_id", owner).single());
    const result: Record<string, unknown> = { ...(body.result ?? {}) };
    if (body.status === "fertig" && job.project_id && Array.isArray(body.result?.items)) {
      result.imported = await importItems(owner, job.project_id, job.target, body.result.items, true);
      delete result.items;
    }
    if (body.status === "fertig" && body.result?.image_base64) {
      result.file_id = await storeFile(owner, job.project_id, body.result.image_name ?? "render.png", body.result.image_mime ?? "image/png", body.result.image_base64, "visualisierung");
      delete result.image_base64;
    }
    must(await admin.from("bridge_jobs").update({ status: body.status === "fertig" ? "fertig" : "fehler", result, updated_at: new Date().toISOString() }).eq("id", job.id));
    return json({ ok: true });
  }

  if (path === "/bridge/import" && req.method === "POST") {
    const body = await req.json();
    const n = await importItems(owner, body.project_id, body.source ?? "sketchup", body.items ?? [], body.replace !== false);
    return json({ ok: true, imported: n });
  }

  if (path === "/bridge/upload" && req.method === "POST") {
    const body = await req.json();
    const id = await storeFile(owner, body.project_id ?? null, body.name ?? "datei", body.mime ?? "application/octet-stream", body.base64, body.kind ?? "cad");
    return json({ ok: true, file_id: id });
  }

  return json({ error: "Unbekannter Pfad" }, 404);
}
