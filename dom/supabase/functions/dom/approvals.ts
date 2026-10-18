// Kunden-Freigabe per Link: öffentlich lesbar über das geheime Token, Entscheidung einmalig.
import { admin, must } from "./db.ts";

type Deliver = (owner: string, text: string) => Promise<void>;

async function load(token: string) {
  const rows = must(await admin.from("approvals")
    .select("id, owner_id, project_id, title, description, status, client_name, client_comment, decided_at, created_at, projects(name), files(storage_path, mime, name)")
    .eq("token", token).limit(1));
  return rows[0] ?? null;
}

export async function getApproval(token: string) {
  const a = await load(token);
  if (!a) return null;
  const profile = must(await admin.from("profiles").select("user_name, company_name").eq("owner_id", a.owner_id).single());
  let file = null;
  if (a.files) {
    const signed = must(await admin.storage.from("files").createSignedUrl(a.files.storage_path, 3600));
    file = { url: signed.signedUrl, mime: a.files.mime, name: a.files.name };
  }
  return {
    title: a.title, description: a.description, project: a.projects?.name ?? "", status: a.status,
    client_name: a.client_name, client_comment: a.client_comment, decided_at: a.decided_at, created_at: a.created_at,
    from: profile.company_name || profile.user_name || "", file,
  };
}

export async function decideApproval(token: string, body: { decision?: string; name?: string; comment?: string }, deliver: Deliver) {
  const a = await load(token);
  if (!a) return { error: "Freigabe nicht gefunden", status: 404 };
  if (a.status !== "offen") return { error: "Diese Freigabe wurde bereits beantwortet.", status: 409 };
  const decision = body.decision === "freigegeben" ? "freigegeben" : body.decision === "abgelehnt" ? "abgelehnt" : null;
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!decision || !name) return { error: "Bitte Namen und Entscheidung angeben.", status: 400 };
  const comment = String(body.comment ?? "").trim().slice(0, 2000) || null;
  must(await admin.from("approvals").update({
    status: decision, client_name: name, client_comment: comment, decided_at: new Date().toISOString(),
  }).eq("id", a.id).eq("status", "offen"));
  must(await admin.from("logs").insert({
    owner_id: a.owner_id, project_id: a.project_id, source: "freigabe",
    text: `Kunde ${name} hat „${a.title}“ ${decision === "freigegeben" ? "freigegeben" : "abgelehnt"}${comment ? `: „${comment}“` : "."}`,
  }));
  await deliver(a.owner_id, `${decision === "freigegeben" ? "✅" : "❌"} ${name} hat „${a.title}“ (${a.projects?.name ?? ""}) ${decision === "freigegeben" ? "freigegeben" : "abgelehnt"}.${comment ? `\nKommentar: „${comment}“` : ""}`);
  return { ok: true, status: 200 };
}
