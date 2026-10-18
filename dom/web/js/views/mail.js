// E-Mail entwerfen lassen (KI) und als Gmail-Entwurf sichern oder senden.
import { api } from "../supa.js";
import { formSheet, toast } from "../ui.js";

/** Lässt die KI eine E-Mail formulieren. Antwortformat: „Betreff: …“, Leerzeile, Text. */
export async function draftWithAI(instruction) {
  const { text } = await api("/compose", {
    instruction: `${instruction}\n\nAntworte ausschließlich im Format:\nBetreff: <Betreff>\n\n<E-Mail-Text ohne Signatur, Sie-Form, österreichisches Geschäftsdeutsch>`,
  });
  const m = text.match(/^\s*Betreff:\s*(.+)\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: "", body: text.trim() };
}

/** Vorschau-Sheet: Text prüfen und anpassen, dann als Entwurf sichern (Standard) oder direkt senden. */
export function mailSheet({ to = "", cc = "", subject = "", body = "", title = "E-Mail" }) {
  return formSheet({
    title,
    confirm: "Sichern",
    wide: true,
    values: { to, cc, subject, body, send_now: false },
    sections: [
      { fields: [
        { name: "to", label: "An", type: "email", required: true, autocomplete: "email" },
        { name: "cc", label: "Kopie", type: "email" },
        { name: "subject", label: "Betreff", required: true },
      ] },
      { fields: [{ name: "body", label: "Text", type: "textarea", rows: 14, required: true }],
        footer: "Deine Signatur aus den Einstellungen wird beim Speichern in Gmail angehängt." },
      { fields: [{ name: "send_now", label: "Sofort senden", type: "switch" }],
        footer: "Aus: wird als Entwurf in deinem Gmail-Konto gespeichert, damit du ihn dort noch prüfen kannst." },
    ],
    onSubmit: async (v) => {
      const { signature } = await import("./settings.js").then((m) => m.signature());
      const mail = { to: v.to, cc: v.cc ?? undefined, subject: v.subject, body: signature ? `${v.body}\n\n${signature}` : v.body };
      if (v.send_now) {
        await api("/google/send", mail);
        toast(`E-Mail an ${v.to} gesendet`);
      } else {
        await api("/google/draft", mail);
        toast("Als Entwurf in Gmail gespeichert");
      }
      return true;
    },
  });
}
