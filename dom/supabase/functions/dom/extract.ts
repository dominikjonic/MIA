// Dokumente auslesen: Angebote (Einzelpreise je Ausschreibungsposition) und Rechnungen (Betrag, Kategorie).
// Claude liest PDF oder Foto und antwortet in einem festen JSON-Schema.
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { admin, must } from "./db.ts";
import { clientFor } from "./ai.ts";

async function fileContent(owner: string, fileId: string): Promise<Anthropic.Beta.BetaContentBlockParam> {
  const f = must(await admin.from("files").select("storage_path, mime, name").eq("id", fileId).eq("owner_id", owner).single());
  const { data, error } = await admin.storage.from("files").download(f.storage_path);
  if (error || !data) throw new Error("Datei konnte nicht geladen werden.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const mime = f.mime || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  if (mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) {
    return { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: b64 } };
  }
  throw new Error("Bitte ein PDF oder Foto (JPG, PNG) hochladen.");
}

async function ask(owner: string, doc: Anthropic.Beta.BetaContentBlockParam, instruction: string, schema: Record<string, unknown>) {
  const { client, model } = await clientFor(owner);
  const response = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: [doc, { type: "text", text: instruction }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Die KI konnte das Dokument nicht auslesen.");
  const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });

export async function extractOffer(owner: string, fileId: string, tenderId: string) {
  const tender = must(await admin.from("tenders").select("id, title").eq("id", tenderId).eq("owner_id", owner).single());
  const positions = must(await admin.from("tender_positions").select("id, title, quantity, unit").eq("tender_id", tender.id).order("position"));
  const list = positions.map((p: { id: string; title: string; quantity: number; unit: string }) => `- ${p.id}: ${p.title} (${p.quantity} ${p.unit})`).join("\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["bidder_company", "bidder_email", "prices", "discount_pct", "extra_costs", "delivery_weeks", "valid_until", "notes"],
    properties: {
      bidder_company: { type: "string", description: "Firmenname des Anbieters" },
      bidder_email: nullable("string"),
      prices: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["position_id", "unit_price"],
          properties: { position_id: { type: "string" }, unit_price: { type: "number", description: "Einzelpreis netto in Euro" } },
        },
      },
      discount_pct: { type: "number", description: "Gesamtrabatt in Prozent, 0 wenn keiner" },
      extra_costs: { type: "number", description: "Fracht, Montage, Pauschalen netto in Euro, 0 wenn keine" },
      delivery_weeks: nullable("number"),
      valid_until: { anyOf: [{ type: "string", description: "YYYY-MM-DD" }, { type: "null" }] },
      notes: { type: "string", description: "Wichtige Bedingungen in einem Satz (Zahlungsziel, Montage inkl./exkl., Abweichungen)" },
    },
  };
  return ask(owner, await fileContent(owner, fileId), `Das ist ein Angebot zur Ausschreibung „${tender.title}“.
Ordne jede angebotene Leistung genau einer dieser Positionen zu (nach Bedeutung, nicht nur Wortlaut) und gib den Einzelpreis NETTO je Einheit an:
${list}
Positionen, die nicht angeboten werden, lässt du weg. Preise immer netto; wenn nur brutto angegeben ist, durch 1,2 teilen (20 % USt.).`, schema);
}

export async function extractInvoice(owner: string, fileId: string, projectId: string) {
  const cats = must(await admin.from("budget_categories").select("id, name").eq("project_id", projectId).eq("owner_id", owner).order("position"));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["supplier", "title", "amount_net", "date", "category_id", "invoice_number"],
    properties: {
      supplier: { type: "string" },
      title: { type: "string", description: "Kurze Bezeichnung, z. B. „Teilrechnung Trockenbau“" },
      amount_net: { type: "number", description: "Rechnungsbetrag netto in Euro" },
      date: { anyOf: [{ type: "string", description: "Rechnungsdatum YYYY-MM-DD" }, { type: "null" }] },
      category_id: { type: "string", enum: cats.map((c: { id: string }) => c.id) },
      invoice_number: nullable("string"),
    },
  };
  return ask(owner, await fileContent(owner, fileId), `Das ist eine Rechnung zu einem Büro-Einrichtungsprojekt. Lies Lieferant, Netto-Betrag und Datum aus und wähle die passende Budgetkategorie:
${cats.map((c: { id: string; name: string }) => `- ${c.id}: ${c.name}`).join("\n")}`, schema);
}
