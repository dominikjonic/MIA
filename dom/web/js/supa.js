// Datenzugriff: Supabase-Client (RLS schützt die Daten) und Aufrufe der Server-Funktion.
import { FUNCTION_URL, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export let currentUser = null;
export function setUser(u) { currentUser = u; }

/** Wirft bei Fehlern statt sie zu verschlucken. */
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export async function api(path, body = undefined) {
  const { data } = await db.auth.getSession();
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || out.message || `Serverfehler ${res.status}`);
  return out;
}

export async function uploadFile(file, { projectId = null, kind = "dokument", logId = null, caption = null } = {}) {
  const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${currentUser.id}/${projectId ?? "eingang"}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
  await q(db.storage.from("files").upload(path, file, { contentType: file.type || undefined }));
  return q(db.from("files").insert({
    project_id: projectId, kind, log_id: logId, storage_path: path, name: file.name, mime: file.type, size: file.size, caption,
  }).select().single());
}

const urlCache = new Map();
export async function signedUrl(path) {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await db.storage.from("files").createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Ersetzt <img data-path> nach dem Rendern durch signierte URLs. */
export async function hydrateImages(root = document) {
  for (const img of root.querySelectorAll("img[data-path]")) {
    const url = await signedUrl(img.dataset.path);
    if (url) img.src = url;
  }
}
