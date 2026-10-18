// Einstellungen (Profil, Benachrichtigungen, Konto) und Konnektoren (Claude, WhatsApp, Google, Higgsfield, CAD, MCP).
import { api, currentUser, db, q } from "../supa.js";
import { FUNCTION_URL } from "../config.js";
import { icon } from "../icons.js";
import { actionSheet, confirmDialog, contentSheet, empty, errorToast, esc, formSheet, header, navButton, parseNumber, toast } from "../ui.js";
import { BUILTIN } from "../templates.js";

export async function signature() {
  const p = await q(db.from("profiles").select("email_signature").maybeSingle());
  return { signature: p?.email_signature ?? "" };
}

// ---------------------------------------------------------------- Konnektor-Typen

const TYPES = [
  {
    kind: "claude", title: "Claude (KI-Assistent)", icon: "assistant", tint: "var(--system-orange)", mode: "api",
    desc: "Das Gehirn des Assistenten in App und WhatsApp.",
    fields: [
      { name: "api_key", label: "API-Schlüssel", type: "secret", secret: true, placeholder: "sk-ant-…" },
      { name: "model", label: "Modell", type: "select", options: [["claude-opus-5-5", "Claude Opus 5.5 (empfohlen)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5 (schneller, günstiger)"], ["claude-haiku-5-5", "Claude Haiku 5.5 (am günstigsten)"]] },
      { name: "effort", label: "Gründlichkeit", type: "select", options: [["low", "Schnell"], ["medium", "Ausgewogen"], ["high", "Gründlich"]] },
    ],
    defaults: { model: "claude-opus-5-5", effort: "medium" },
    help: `Schlüssel erstellen: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API Keys</a>. Abgerechnet wird nach Nutzung. Deine Projektdaten werden nur für die jeweilige Anfrage an Anthropic übermittelt und nicht zum Training verwendet.`,
  },
  {
    kind: "whatsapp", title: "WhatsApp", icon: "whatsapp", tint: "var(--system-green)", mode: "api",
    desc: "Mit dem Assistenten chatten, Fotos schicken, Erinnerungen und Morgen-Briefing.",
    fields: [
      { name: "phone_number_id", label: "Phone-Number-ID", placeholder: "z. B. 1234567890" },
      { name: "access_token", label: "Zugriffstoken", type: "secret", secret: true, placeholder: "Dauerhaftes System-User-Token" },
      { name: "app_secret", label: "App-Geheimnis", type: "secret", secret: true, placeholder: "Zum Prüfen der Webhook-Signatur" },
      { name: "template_name", label: "Vorlage (optional)", placeholder: "z. B. dom_hinweis" },
      { name: "template_language", label: "Vorlagensprache", placeholder: "de" },
    ],
    defaults: { template_language: "de" },
    help: (c, info) => `Einrichtung im <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">Meta-Entwicklerportal</a>: App vom Typ „Business“ → Produkt „WhatsApp“ → Telefonnummer hinzufügen.<br>
      Webhook-URL: <code>${esc(info.whatsapp_webhook)}</code><br>
      Verify-Token: <code>${esc(c?.config?.verify_token ?? "erscheint nach dem Sichern")}</code><br>
      Webhook-Feld <b>messages</b> abonnieren. Deine eigene Handynummer trägst du in den Einstellungen unter „Benachrichtigungen“ ein – nur sie darf mit dem Assistenten schreiben.<br>
      Außerhalb von 24 Stunden nach deiner letzten Nachricht erlaubt WhatsApp nur genehmigte Vorlagen: Lege im WhatsApp-Manager eine Vorlage (Kategorie „Utility“) mit genau einer Variable <code>{{1}}</code> an und trage ihren Namen hier ein – dann kommen Briefing und Erinnerungen immer an.`,
  },
  {
    kind: "google", title: "Google (Gmail & Kalender)", icon: "mail", tint: "var(--system-red)", mode: "oauth",
    desc: "E-Mail-Entwürfe, Senden, Postfach durchsuchen, Termine im Kalender.",
    fields: [
      { name: "client_id", label: "Client-ID", placeholder: "….apps.googleusercontent.com" },
      { name: "client_secret", label: "Client-Secret", type: "secret", secret: true },
    ],
    help: (c, info) => `In der <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>: Gmail API und Google Calendar API aktivieren → OAuth-Zustimmungsbildschirm (bei Google Workspace „Intern“ wählen) → Anmeldedaten → OAuth-Client-ID vom Typ „Webanwendung“.<br>
      Autorisierte Weiterleitungs-URI: <code>${esc(info.google_redirect)}</code><br>
      Danach hier sichern und auf „Mit Google verbinden“ tippen.${c?.config?.email ? `<br>Verbunden als <b>${esc(c.config.email)}</b>.` : ""}`,
  },
  {
    kind: "higgsfield", title: "Higgsfield (Visualisierung)", icon: "sparkle", tint: "var(--system-purple)", mode: "api",
    desc: "Fotorealistische Renderings aus Konzept, Skizze oder SketchUp-Ansicht.",
    fields: [
      { name: "api_key", label: "API-Key-ID", type: "secret", secret: true },
      { name: "api_secret", label: "API-Secret", type: "secret", secret: true },
      { name: "base_url", label: "API-Adresse", placeholder: "https://platform.higgsfield.ai" },
      { name: "model_path", label: "Modell", placeholder: "higgsfield-ai/soul/standard" },
      { name: "aspect_ratio", label: "Format", type: "select", options: [["16:9", "16:9 Querformat"], ["4:3", "4:3"], ["3:2", "3:2"], ["1:1", "Quadrat"], ["9:16", "9:16 Hochformat"]] },
      { name: "resolution", label: "Auflösung", type: "select", options: [["720p", "720p"], ["1080p", "1080p"], ["2k", "2K"]] },
    ],
    defaults: { base_url: "https://platform.higgsfield.ai", model_path: "higgsfield-ai/soul/standard", aspect_ratio: "16:9", resolution: "1080p" },
    help: `Schlüssel unter <a href="https://cloud.higgsfield.ai" target="_blank" rel="noopener">cloud.higgsfield.ai</a> → API Keys. Adresse und Modell kannst du ändern, wenn Higgsfield neue Modelle anbietet (siehe docs.higgsfield.ai).`,
  },
  {
    kind: "bridge", title: "Desktop-Brücke", icon: "link", tint: "var(--system-gray)", mode: "bridge",
    desc: "Verbindet Blender, SketchUp und AutoCAD auf deinem Rechner mit DOM.",
    fields: [],
    help: () => `Die Brücke ist ein kleines Programm, das auf deinem Rechner läuft (Python 3, keine Installation nötig). Sie holt Aufträge von DOM ab und spricht lokal mit Blender (über das Blender-MCP-Add-on) und leitet Exporte aus SketchUp/AutoCAD weiter.`,
  },
  {
    kind: "blender", title: "Blender", icon: "cube", tint: "var(--system-orange)", modes: ["bridge", "mcp"],
    desc: "Stückliste aus der Szene, Renderings.",
    fields: [
      { name: "url", label: "MCP-URL (nur Modus MCP)", placeholder: "https://…" },
      { name: "token", label: "MCP-Token", type: "secret", secret: true },
    ],
    help: `<b>Modus Desktop-Brücke</b> (empfohlen): In Blender das Add-on „Blender MCP“ installieren und in der Seitenleiste „Connect to MCP server“ klicken. Die Desktop-Brücke verbindet sich lokal (Port 9876).<br><b>Modus MCP</b>: Wenn dein Blender-MCP-Server öffentlich per https erreichbar ist (z. B. über einen Tunnel), trag die URL ein – dann nutzt der Assistent seine Werkzeuge direkt.`,
  },
  {
    kind: "sketchup", title: "SketchUp", icon: "cube", tint: "var(--system-red)", modes: ["bridge", "mcp"],
    desc: "Stückliste und Szenen-Bilder direkt aus SketchUp.",
    fields: [
      { name: "url", label: "MCP-URL (nur Modus MCP)", placeholder: "https://…" },
      { name: "token", label: "MCP-Token", type: "secret", secret: true },
    ],
    help: () => `<b>DOM-Erweiterung</b>: Lade <a href="downloads/dom_sketchup.rb" download>dom_sketchup.rb</a> und kopiere sie in den SketchUp-Plugins-Ordner (Fenster → Erweiterungs-Manager → Installieren geht ebenfalls). Danach: Erweiterungen → DOM → Verbinden (Brücken-Token eingeben) → Stückliste senden / Ansicht senden.`,
  },
  {
    kind: "autocad", title: "AutoCAD", icon: "ruler", tint: "var(--system-blue)", modes: ["bridge", "mcp"],
    desc: "Blöcke zählen, Datenextraktion übernehmen.",
    fields: [
      { name: "url", label: "MCP-URL (nur Modus MCP)", placeholder: "https://…" },
      { name: "token", label: "MCP-Token", type: "secret", secret: true },
    ],
    help: `Ohne Zusatzsoftware: Zeichnung als <b>DXF</b> speichern oder <code>DATENEXTRAKTION</code> als CSV ausgeben und in der Stückliste importieren.<br>Mit der Desktop-Brücke: Exporte im Ordner <code>DOM-Eingang</code> werden automatisch dem gewählten Projekt zugeordnet.`,
  },
  {
    kind: "mcp", title: "Weiterer MCP-Server", icon: "plug", tint: "var(--system-indigo)", mode: "mcp", multiple: true,
    desc: "Beliebige Werkzeuge per Model Context Protocol für den Assistenten.",
    fields: [
      { name: "name", label: "Name", placeholder: "z. B. Herstellerkatalog" },
      { name: "url", label: "URL", placeholder: "https://…/mcp" },
      { name: "token", label: "Token (optional)", type: "secret", secret: true },
    ],
    help: `Der MCP-Server muss öffentlich per https erreichbar sein (Streamable HTTP). Der Assistent sieht dann automatisch alle Werkzeuge dieses Servers.`,
  },
];

const STATUS = {
  verbunden: ["Verbunden", "positive", "check"],
  fehler: ["Fehler", "critical", "warning"],
  unbekannt: ["Nicht geprüft", "", "info"],
};

async function connectorSheet(type, connector, info) {
  const isMcpMode = connector?.mode === "mcp" || type.mode === "mcp";
  const modeField = type.modes ? [{ name: "mode", label: "Verbindung", type: "select", options: [["bridge", "Über Desktop-Brücke"], ["mcp", "MCP-Server (URL)"]] }] : [];
  const fields = [...modeField, ...type.fields.map((f) => (f.secret ? { ...f, hasValue: connector?.has_secret } : f))];
  const values = { ...(type.defaults ?? {}), ...(connector?.config ?? {}), mode: connector?.mode ?? type.modes?.[0] ?? type.mode, name: connector?.name, enabled: connector?.enabled ?? true };
  let bridgeHtml = "";
  if (type.kind === "bridge" && connector) {
    const { token } = await api("/connectors/bridge-token");
    bridgeHtml = `<div class="card stack">
      <div><div class="t-footnote secondary">Brücken-Token</div><code style="word-break:break-all">${esc(token ?? "")}</code></div>
      <div><div class="t-footnote secondary">Server</div><code style="word-break:break-all">${esc(info.bridge_url)}</code></div>
      <div class="btn-row"><a class="btn btn-tinted small" href="downloads/dom_bridge.py" download>${icon("download", "sm")}dom_bridge.py</a>
        <a class="btn btn-gray small" href="downloads/dom_sketchup.rb" download>${icon("download", "sm")}SketchUp-Erweiterung</a></div>
      <div class="t-footnote secondary">Start im Terminal: <code>python3 dom_bridge.py</code> – beim ersten Start fragt die Brücke nach Server und Token.</div></div>`;
  }
  const helpText = typeof type.help === "function" ? type.help(connector, info) : type.help;
  const result = await formSheet({
    title: type.title,
    confirm: connector ? "Sichern" : type.kind === "bridge" ? "Einrichten" : "Hinzufügen",
    values,
    sections: [
      ...(fields.length ? [{ fields }] : []),
      ...(bridgeHtml ? [{ html: bridgeHtml }] : []),
      { html: `<p class="group-footer" style="margin-top:0">${helpText}</p>` },
      ...(connector ? [{ fields: [{ name: "enabled", label: "Aktiv", type: "switch" }] }] : []),
    ],
    destructive: connector ? { label: "Konnektor entfernen", confirmTitle: `${type.title} entfernen?`, message: "Gespeicherte Schlüssel werden gelöscht.",
      onConfirm: () => q(db.from("connectors").delete().eq("id", connector.id)) } : null,
    onSubmit: async (v) => {
      const secrets = {};
      const config = { ...(connector?.config ?? {}) };
      for (const f of type.fields) {
        if (f.secret) { if (v[f.name]) secrets[f.name] = v[f.name]; }
        else if (f.name !== "name") config[f.name] = v[f.name] ?? null;
      }
      const mode = type.modes ? v.mode : type.mode;
      if (mode === "mcp" && !String(config.url ?? "").startsWith("https://")) throw new Error("Für den MCP-Modus wird eine https-URL benötigt.");
      const saved = await api("/connectors/save", {
        id: connector?.id, kind: type.kind, name: type.multiple ? (v.name || "MCP") : type.title, mode, config, secrets,
        enabled: connector ? v.enabled !== false : true,
      });
      return { id: saved.id, mode };
    },
  });
  if (result === "deleted") return true;
  if (!result) return false;
  if (type.kind === "google") {
    const go = await confirmDialog({ title: "Jetzt mit Google verbinden?", message: "Du meldest dich mit deinem Firmen-Google-Konto an und erlaubst DOM Entwürfe, Senden und Kalender.", confirm: "Verbinden", cancel: "Später" });
    if (go) {
      const { url } = await api("/google/auth-url", { return_to: location.origin + location.pathname });
      location.href = url;
      return false;
    }
  } else if (type.kind !== "bridge" && !(type.modes && result.mode === "bridge")) {
    toast("Verbindung wird geprüft …", { duration: 2500 });
    const r = await api("/connectors/test", { id: result.id });
    toast(r.ok ? r.message : `Prüfung fehlgeschlagen: ${r.message}`, { duration: 7000 });
  }
  return true;
}

async function connectorsView(ctx) {
  const [rows, info] = await Promise.all([
    q(db.from("connectors").select("*").order("created_at")),
    api("/connectors/info").catch(() => ({ whatsapp_webhook: "–", google_redirect: "–", bridge_url: "–" })),
  ]);
  const google = ctx.query.get("google");
  if (google) toast(google === "verbunden" ? "Google ist verbunden" : "Google-Verbindung nicht abgeschlossen", { duration: 6000 });

  const row = (type, c) => {
    const [label, tone, ic] = c ? STATUS[c.status] : ["", "", ""];
    const sub = c ? (c.status_message ?? (c.mode === "bridge" ? "über Desktop-Brücke" : type.desc)) : type.desc;
    return `<li><button class="cell" data-kind="${type.kind}" ${c ? `data-id="${c.id}"` : ""}>
      <span class="cell-icon" style="--tint:${type.tint}">${icon(type.icon)}</span>
      <span class="cell-text"><span class="cell-title">${esc(c && type.multiple ? c.name : type.title)}${c && !c.enabled ? " (aus)" : ""}</span><span class="cell-sub">${esc(sub)}</span></span>
      ${c ? `<span class="pill ${tone}">${icon(ic)}${label}</span>` : '<span class="cell-detail">Einrichten</span>'}<span class="chevron">${icon("chevronRight")}</span></button></li>`;
  };
  const group = (title, kinds, footer = "") => `<section class="group"><h2 class="group-header small">${title}</h2><ul class="list with-icons">
    ${kinds.map((k) => { const t = TYPES.find((x) => x.kind === k); const cs = rows.filter((r) => r.kind === k);
      return t.multiple ? [...cs.map((c) => row(t, c)), row(t, null)].join("") : row(t, cs[0]); }).join("")}
    </ul>${footer ? `<p class="group-footer">${footer}</p>` : ""}</section>`;

  ctx.root.innerHTML = `
    ${header({ title: "Konnektoren", back: { href: "#/einstellungen", label: "Einstellungen" }, actions: navButton("test-all", "refresh", "Alle prüfen") })}
    <div class="page narrow">
      ${group("Assistent & Kommunikation", ["claude", "whatsapp", "google"], "Zugangsschlüssel werden verschlüsselt auf dem Server gespeichert und nie wieder im Browser angezeigt.")}
      ${group("Planung & Visualisierung", ["higgsfield", "bridge", "blender", "sketchup", "autocad"], "Blender, SketchUp und AutoCAD laufen auf deinem Rechner. Die Desktop-Brücke verbindet sie sicher mit DOM – oder du trägst einen öffentlich erreichbaren MCP-Server ein.")}
      ${group("Erweiterungen", ["mcp"])}
    </div>`;

  ctx.root.addEventListener("click", async (e) => {
    try {
      const b = e.target.closest("[data-kind]");
      if (b) {
        const type = TYPES.find((t) => t.kind === b.dataset.kind);
        const c = rows.find((r) => r.id === b.dataset.id);
        if (c && type.kind === "google" && c.status !== "verbunden" && c.config?.client_id) {
          const choice = await actionSheet({ title: type.title, actions: [{ label: "Mit Google verbinden", value: "connect" }, { label: "Einstellungen bearbeiten", value: "edit" }] });
          if (choice === "connect") { const { url } = await api("/google/auth-url", { return_to: location.origin + location.pathname }); location.href = url; return; }
          if (choice !== "edit") return;
        }
        if (await connectorSheet(type, c, info)) ctx.rerender();
        return;
      }
      if (e.target.closest('[data-action="test-all"]')) {
        toast("Alle Konnektoren werden geprüft …", { duration: 3000 });
        await Promise.all(rows.filter((r) => r.enabled).map((r) => api("/connectors/test", { id: r.id }).catch(() => null)));
        ctx.rerender();
      }
    } catch (err) { errorToast(err); }
  });
}

// ---------------------------------------------------------------- Einstellungen

async function settingsView(ctx) {
  const [profile, connectors, templates] = await Promise.all([
    q(db.from("profiles").select("*").maybeSingle()),
    q(db.from("connectors").select("kind, status")),
    q(db.from("project_templates").select("id")),
  ]);
  const p = { ...(profile ?? {}) };
  if (p.hourly_rate != null) p.hourly_rate = String(Number(p.hourly_rate)).replace(".", ",");
  const ok = connectors.filter((c) => c.status === "verbunden").length;
  const icsUrl = `${FUNCTION_URL}/ics/${p.ics_token ?? ""}.ics`;

  const field = (name, label, type = "text", attrs = "") =>
    `<li><div class="field"><label for="s-${name}">${label}</label><input id="s-${name}" name="${name}" type="${type}" value="${esc(p[name] ?? "")}" ${attrs}></div></li>`;

  ctx.root.innerHTML = `
    ${header({ title: "Einstellungen" })}
    <div class="page narrow">
      <form data-profile>
        <section class="group"><h2 class="group-header small">Profil</h2><ul class="list form-list">
          ${field("user_name", "Name", "text", 'autocomplete="name"')}
          ${field("company_name", "Firma", "text", 'autocomplete="organization"')}
          ${field("hourly_rate", "Stundensatz", "text", 'inputmode="decimal" placeholder="z. B. 95"')}
          <li><div class="field stacked"><label for="s-sig">E-Mail-Signatur</label><textarea id="s-sig" name="email_signature" rows="4" placeholder="Mit freundlichen Grüßen&#10;Name&#10;Firma · Telefon">${esc(p.email_signature ?? "")}</textarea></div></li>
        </ul><p class="group-footer">Name und Firma verwendet der Assistent in E-Mails und Anfragen. Der Stundensatz (netto, €) bewertet die Zeiterfassung.</p></section>

        <section class="group"><h2 class="group-header small">Benachrichtigungen</h2><ul class="list form-list">
          ${field("whatsapp_number", "WhatsApp-Nummer", "tel", 'placeholder="43664…" inputmode="tel"')}
          <li><div class="field"><label for="s-ch">Erinnerungen über</label><select id="s-ch" name="reminder_channel">
            <option value="whatsapp" ${p.reminder_channel === "whatsapp" ? "selected" : ""}>WhatsApp</option><option value="app" ${p.reminder_channel === "app" ? "selected" : ""}>Nur in der App</option></select></div></li>
          <li><div class="field"><label for="s-be">Morgen-Briefing</label><input id="s-be" name="briefing_enabled" type="checkbox" class="switch" role="switch" ${p.briefing_enabled !== false ? "checked" : ""}></div></li>
          ${field("briefing_time", "Briefing um", "time")}
        </ul><p class="group-footer">Deine eigene Handynummer im internationalen Format ohne + (z. B. 43664 1234567). Nur diese Nummer darf dem Assistenten schreiben. Das Briefing enthält Termine, fällige Aufgaben, Budgetwarnungen und den Stand jedes Projekts.</p></section>
      </form>

      <section class="group"><ul class="list with-icons">
        <li><a class="cell" href="#/einstellungen/konnektoren"><span class="cell-icon" style="--tint:var(--system-indigo)">${icon("plug")}</span>
          <span class="cell-text"><span class="cell-title">Konnektoren</span></span><span class="cell-detail">${ok} verbunden</span><span class="chevron">${icon("chevronRight")}</span></a></li>
        <li><a class="cell" href="#/einstellungen/vorlagen"><span class="cell-icon" style="--tint:var(--system-orange)">${icon("template")}</span>
          <span class="cell-text"><span class="cell-title">Projektvorlagen</span></span><span class="cell-detail">${templates.length + 3}</span><span class="chevron">${icon("chevronRight")}</span></a></li>
      </ul><p class="group-footer">Konnektoren: Claude, WhatsApp, Gmail & Kalender, Higgsfield, Blender, SketchUp, AutoCAD und weitere MCP-Server. Vorlagen: eigene Phasenpläne für neue Projekte.</p></section>

      <section class="group"><h2 class="group-header small">Kalender-Abo</h2><ul class="list with-icons">
        <li><a class="cell" href="${esc(icsUrl.replace("https://", "webcal://"))}"><span class="cell-icon" style="--tint:var(--system-red)">${icon("calendar")}</span>
          <span class="cell-text"><span class="cell-title">In Kalender abonnieren</span><span class="cell-sub">Apple Kalender, Outlook</span></span><span class="chevron">${icon("chevronRight")}</span></a></li>
        <li><button class="cell" data-action="copy-ics"><span class="cell-icon" style="--tint:var(--system-gray)">${icon("link")}</span>
          <span class="cell-text"><span class="cell-title">Link kopieren</span><span class="cell-sub">für Google Kalender: „Per URL hinzufügen“</span></span></button></li>
      </ul><p class="group-footer">Termine, Aufgaben-Fälligkeiten, Phasenenden, Angebotsfristen und Umzüge erscheinen automatisch in deinem Kalender und aktualisieren sich laufend. Der Link ist geheim – gib ihn nicht weiter.</p></section>

      <section class="group"><h2 class="group-header small">Konto</h2><ul class="list">
        <li><div class="cell"><span class="cell-text"><span class="cell-title">${esc(currentUser?.email ?? "")}</span></span></div></li>
        <li><button class="cell" data-action="logout" style="color:var(--critical)">Abmelden</button></li>
      </ul></section>
      <p class="group-footer" style="text-align:center">DOM · Daten in der EU (Supabase, Frankfurt)</p>
    </div>`;

  const form = ctx.root.querySelector("[data-profile]");
  form.addEventListener("change", async (e) => {
    const el = e.target;
    let value = el.type === "checkbox" ? el.checked : el.value.trim() || null;
    if (el.name === "hourly_rate" && value != null) {
      value = parseNumber(value);
      if (Number.isNaN(value)) return errorToast(new Error("Bitte einen Betrag eingeben, z. B. 95"));
    }
    const patch = { [el.name]: el.name === "whatsapp_number" && value ? String(value).replace(/\D/g, "") : value };
    try {
      await q(db.from("profiles").update(patch).eq("owner_id", currentUser.id));
      if (el.name === "whatsapp_number" && value) el.value = patch.whatsapp_number;
    } catch (err) { errorToast(err); }
  });
  ctx.root.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="copy-ics"]')) {
      try { await navigator.clipboard.writeText(icsUrl); toast("Link kopiert"); } catch { prompt("Link zum Kopieren:", icsUrl); }
      return;
    }
    if (!e.target.closest('[data-action="logout"]')) return;
    if (await confirmDialog({ title: "Abmelden?", confirm: "Abmelden" })) await db.auth.signOut();
  });
}

// ---------------------------------------------------------------- Projektvorlagen

function phaseList(t) {
  return `<ol class="template-phases">${(t?.phases ?? []).map((ph) => `<li><b>${esc(ph.title)}</b>${ph.tasks?.length ? `<br><span class="secondary t-footnote">${ph.tasks.map(esc).join(" · ")}</span>` : ""}</li>`).join("")}</ol>`;
}

async function templatesView(ctx) {
  const own = await q(db.from("project_templates").select("*").order("name"));
  ctx.root.innerHTML = `
    ${header({ title: "Projektvorlagen", back: { href: "#/einstellungen", label: "Einstellungen" } })}
    <div class="page narrow">
      <section class="group"><h2 class="group-header small">Mitgeliefert</h2><ul class="list">
        ${BUILTIN.map((t, i) => `<li><button class="cell" data-builtin="${i}"><span class="cell-text"><span class="cell-title">${esc(t.name)}</span>
          <span class="cell-sub">${t.template ? `${t.template.phases.length} Phasen` : "Naturmaß bis Abnahme"}</span></span><span class="chevron">${icon("chevronRight")}</span></button></li>`).join("")}
      </ul></section>
      <section class="group"><h2 class="group-header small">Eigene Vorlagen</h2>
        ${own.length ? `<ul class="list">${own.map((t) => `<li><button class="cell" data-own="${t.id}"><span class="cell-text"><span class="cell-title">${esc(t.name)}</span>
          <span class="cell-sub">${t.template?.phases?.length ?? 0} Phasen · ${(t.template?.phases ?? []).reduce((s, p) => s + (p.tasks?.length ?? 0), 0)} Aufgaben</span></span><span class="chevron">${icon("chevronRight")}</span></button></li>`).join("")}</ul>`
          : empty({ icon: "template", title: "Noch keine eigenen Vorlagen", text: "Passe in einem Projekt die Phasen an (Fahrplan → Bearbeiten) und wähle dann im Projekt-Menü „Als Vorlage sichern“." })}
        <p class="group-footer">Beim Anlegen eines Projekts wählst du die Vorlage. Termine werden aus Start- und Umzugsdatum automatisch verteilt.</p>
      </section>
    </div>`;
  ctx.root.addEventListener("click", async (e) => {
    try {
      const b = e.target.closest("[data-builtin]");
      if (b) {
        const t = BUILTIN[Number(b.dataset.builtin)];
        contentSheet({ title: t.name, html: t.template ? phaseList(t.template) : '<p class="secondary">Die 13 Standardphasen: Projektanlage, Naturmaß, Konzept, Planung, Trockenbau, Möblierung, Visualisierung, Ausschreibung, Angebotsvergleich, Vergabe, Terminierung, Umzug, Projektüberwachung & Abnahme – jeweils mit Aufgaben.</p>' });
        return;
      }
      const o = e.target.closest("[data-own]");
      if (!o) return;
      const t = own.find((x) => x.id === o.dataset.own);
      const choice = await actionSheet({ title: t.name, actions: [
        { label: "Phasen ansehen", value: "show" }, { label: "Umbenennen", value: "rename" }, { label: "Löschen", value: "delete", destructive: true },
      ] });
      if (choice === "show") contentSheet({ title: t.name, html: phaseList(t.template) });
      if (choice === "rename" && await formSheet({
        title: "Vorlage umbenennen", values: { name: t.name }, sections: [{ fields: [{ name: "name", label: "Name", required: true }] }],
        onSubmit: (v) => q(db.from("project_templates").update({ name: v.name }).eq("id", t.id)).then(() => true),
      })) ctx.rerender();
      if (choice === "delete" && await confirmDialog({ title: `„${t.name}“ löschen?`, message: "Bestehende Projekte bleiben unverändert.", confirm: "Löschen", destructive: true })) {
        await q(db.from("project_templates").delete().eq("id", t.id));
        ctx.rerender();
      }
    } catch (err) { errorToast(err); }
  });
}

export default function (ctx) {
  if (ctx.mode === "templates") return templatesView(ctx);
  return ctx.mode === "connectors" ? connectorsView(ctx) : settingsView(ctx);
}

// Hilfe-Sheet, falls aus anderen Ansichten benötigt
export function connectorHelp(kind) {
  const t = TYPES.find((x) => x.kind === kind);
  contentSheet({ title: t.title, html: `<p>${typeof t.help === "function" ? t.help(null, {}) : t.help}</p>` });
}
