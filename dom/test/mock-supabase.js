// Test-Attrappe für supabase-js: In-Memory-Tabellen mit Beispieldaten, Views und Projektvorlage wie in SQL.
// Nur für Oberflächentests (test/index.html) – nicht Teil der ausgelieferten App.
(function () {
  const uid = () => crypto.randomUUID();
  const OWNER = "11111111-1111-1111-1111-111111111111";
  const today = new Date();
  const d = (offset) => { const x = new Date(today); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };
  const at = (offset, h, m = 0) => { const x = new Date(today); x.setDate(x.getDate() + offset); x.setHours(h, m, 0, 0); return x.toISOString(); };

  const T = {
    profiles: [], connectors: [], contacts: [], projects: [], phases: [], tasks: [], budget_categories: [], costs: [], items: [],
    tenders: [], tender_positions: [], tender_bidders: [], offers: [], offer_prices: [], appointments: [], logs: [], files: [],
    move_rooms: [], reminders: [], messages: [], visualizations: [], bridge_jobs: [],
  };
  const DEFAULTS = {
    tasks: { done: false, priority: 0, position: 0, created_by: "app", notes: null, remind_at: null, due_date: null, phase_id: null },
    projects: { status: "aktiv", budget_total: 0 },
    phases: { status: "offen" },
    offers: { status: "eingegangen", discount_pct: 0, extra_costs: 0 },
    tenders: { status: "entwurf" },
    items: { quantity: 1, unit: "Stk", source: "manuell", position: 0 },
    contacts: { kind: "lieferant" },
    appointments: { kind: "termin", remind_minutes: 60 },
    logs: { source: "app" },
    move_rooms: { persons: 0, crates: 0, label_color: "blau", position: 0 },
    bridge_jobs: { status: "offen", payload: {} },
    connectors: { mode: "api", config: {}, enabled: true, status: "unbekannt", has_secret: false },
  };

  // ---------------------------------------------------------------- Vorlage (wie apply_project_template)
  const TEMPLATE = [
    ["anlage", "Projektanlage & Briefing", 3, ["Kundendaten und Ansprechpartner erfassen", "Briefing-Gespräch führen", "Budgetrahmen und Termine klären", "Projektordner und Unterlagen anlegen"]],
    ["aufmass", "Naturmaß & Bestandsaufnahme", 5, ["Aufmaßtermin vereinbaren", "Naturmaß vor Ort nehmen", "Bestand fotografieren", "Grundriss digitalisieren (AutoCAD)", "Anschlüsse Elektro/Daten dokumentieren"]],
    ["konzept", "Konzept & Entwurf", 8, ["Bedarfsanalyse Arbeitsplätze und Flächen", "Moodboard und Materialkonzept erstellen", "Entwurfsvarianten ausarbeiten", "Entwurf dem Kunden präsentieren", "Freigabe Entwurf einholen"]],
    ["planung", "Planung", 8, ["Möblierungsplan erstellen", "Elektro- und Datenplanung abstimmen", "Fluchtwege und Brandschutz prüfen", "Freigabe Planung einholen"]],
    ["trockenbau", "Trockenbauplanung", 6, ["Wände, Decken und Akustik planen", "Details und Anschlüsse zeichnen", "Mengen ermitteln", "Abstimmung mit Vermieter/Hausverwaltung"]],
    ["moeblierung", "Möblierung & Stückliste", 6, ["Möbel auswählen", "Stückliste erstellen", "Muster und Farbproben anfordern", "Materialien und Farben festlegen"]],
    ["visualisierung", "Visualisierung", 5, ["3D-Modell aufbauen (SketchUp/Blender)", "Renderings erstellen (Higgsfield)", "Visualisierung präsentieren"]],
    ["ausschreibung", "Ausschreibung", 6, ["Leistungsverzeichnisse erstellen", "Bieterliste festlegen", "Ausschreibungen versenden", "Rückfragen der Bieter beantworten"]],
    ["vergleich", "Angebotsvergleich", 5, ["Angebote erfassen", "Preisspiegel erstellen", "Nachverhandeln"]],
    ["vergabe", "Auftragsvergabe", 4, ["Vergabeempfehlung an Kunden", "Freigabe Kunde einholen", "Aufträge erteilen", "Absagen versenden"]],
    ["terminierung", "Terminierung", 5, ["Bauzeitenplan erstellen", "Liefer- und Montagetermine bestätigen", "Umzugstermin fixieren", "Spedition beauftragen"]],
    ["umzug", "Umzug", 10, ["Raumzuordnung und Umzugsplan erstellen", "Umzugsetiketten drucken", "IT-Abbau und -Aufbau koordinieren", "Mitarbeiter informieren", "Umzug begleiten"]],
    ["ueberwachung", "Projektüberwachung & Abnahme", 14, ["Wöchentliche Baustellenbesichtigung", "Mängelliste führen", "Abnahme mit Kunde", "Übergabe und Dokumentation", "Schlussrechnungen prüfen"]],
  ];
  const CATS = [["Planung & Honorar", 8], ["Trockenbau", 15], ["Möbel", 45], ["Elektro & IT", 8], ["Boden & Malerei", 7], ["Akustik & Licht", 7], ["Umzug", 5], ["Reserve", 5]];
  const addDays = (s, n) => { const x = new Date(`${s}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  function applyTemplate(pid) {
    const p = T.projects.find((x) => x.id === pid);
    const end = p.end_date ?? (p.move_date ? addDays(p.move_date, 14) : addDays(p.start_date, 90));
    const days = Math.max(Math.round((new Date(end) - new Date(p.start_date)) / 86400000), 14);
    const total = TEMPLATE.reduce((s, x) => s + x[2], 0);
    let cursor = 0;
    TEMPLATE.forEach(([key, title, w, tasks], i) => {
      const start = addDays(p.start_date, Math.floor((days * cursor) / total));
      cursor += w;
      const due = addDays(p.start_date, Math.floor((days * cursor) / total));
      const ph = row("phases", { project_id: pid, key, title, position: i + 1, start_date: start, due_date: due });
      tasks.forEach((t, j) => row("tasks", { project_id: pid, phase_id: ph.id, title: t, due_date: due, position: j + 1, created_by: "vorlage" }));
    });
    CATS.forEach(([name, pct], j) => row("budget_categories", { project_id: pid, name, planned: Math.round(p.budget_total * pct) / 100, position: j + 1 }));
  }

  function syncPhase(phaseId) {
    if (!phaseId) return;
    const ts = T.tasks.filter((t) => t.phase_id === phaseId);
    const open = ts.filter((t) => !t.done).length, done = ts.length - open;
    const ph = T.phases.find((x) => x.id === phaseId);
    if (ph) ph.status = open === 0 && done > 0 ? "erledigt" : done > 0 ? "aktiv" : "offen";
  }

  function row(table, data) {
    const r = { id: uid(), owner_id: OWNER, created_at: new Date().toISOString(), ...(DEFAULTS[table] ?? {}), ...data };
    if (table === "tasks" && r.done && !r.done_at) r.done_at = new Date().toISOString();
    T[table].push(r);
    if (table === "tasks") syncPhase(r.phase_id);
    return r;
  }

  // ---------------------------------------------------------------- Views
  const num = (x) => Number(x ?? 0);
  const views = {
    v_budget_categories: () => T.budget_categories.map((b) => {
      const cs = T.costs.filter((c) => c.category_id === b.id);
      const committed = cs.filter((c) => c.kind === "beauftragt").reduce((s, c) => s + num(c.amount), 0);
      const invoiced = cs.filter((c) => c.kind === "rechnung").reduce((s, c) => s + num(c.amount), 0);
      return { category_id: b.id, owner_id: b.owner_id, project_id: b.project_id, name: b.name, position: b.position, planned: num(b.planned), committed, invoiced,
        forecast: committed > 0 ? Math.max(committed, invoiced) : Math.max(num(b.planned), invoiced) };
    }),
    v_offer_totals: () => T.offers.map((o) => {
      const c = T.contacts.find((x) => x.id === o.contact_id);
      const prices = T.offer_prices.filter((x) => x.offer_id === o.id);
      const net = prices.reduce((s, x) => s + num(T.tender_positions.find((p) => p.id === x.position_id)?.quantity) * num(x.unit_price), 0);
      return { offer_id: o.id, owner_id: o.owner_id, tender_id: o.tender_id, contact_id: o.contact_id, bidder: c?.company ?? c?.name ?? "Unbekannt",
        status: o.status, delivery_weeks: o.delivery_weeks, valid_until: o.valid_until, discount_pct: num(o.discount_pct), extra_costs: num(o.extra_costs),
        net_positions: net, total: Math.round((net * (1 - num(o.discount_pct) / 100) + num(o.extra_costs)) * 100) / 100,
        priced_positions: prices.length, all_positions: T.tender_positions.filter((p) => p.tender_id === o.tender_id).length };
    }),
    v_project_status: () => T.projects.map((p) => {
      const ts = T.tasks.filter((t) => t.project_id === p.id);
      const done = ts.filter((t) => t.done).length;
      const ph = T.phases.filter((x) => x.project_id === p.id && x.status !== "erledigt").sort((a, b) => a.position - b.position)[0];
      const cats = views.v_budget_categories().filter((c) => c.project_id === p.id);
      const sum = (k) => cats.reduce((s, c) => s + c[k], 0);
      const forecast = sum("forecast");
      const overPlan = cats.filter((c) => c.forecast > c.planned && c.planned > 0).length;
      const open = ts.filter((t) => !t.done && t.due_date).map((t) => t.due_date).sort();
      return { project_id: p.id, owner_id: p.owner_id, name: p.name, status: p.status, start_date: p.start_date, move_date: p.move_date, end_date: p.end_date,
        budget_total: num(p.budget_total), tasks_total: ts.length, tasks_done: done, progress_pct: ts.length ? Math.round((100 * done) / ts.length) : 0,
        overdue: ts.filter((t) => !t.done && t.due_date && t.due_date < d(0)).length, next_due: open[0] ?? null,
        current_phase: ph?.title ?? null, current_phase_due: ph?.due_date ?? null, planned: sum("planned"), committed: sum("committed"), invoiced: sum("invoiced"), forecast,
        budget_state: num(p.budget_total) <= 0 ? "offen" : forecast > num(p.budget_total) ? "ueberschritten" : overPlan ? "knapp" : "im_budget" };
    }),
  };

  // ---------------------------------------------------------------- Query-Builder
  const REL = {
    projects: (r) => r.project_id, phases: (r) => r.phase_id, contacts: (r) => r.contact_id ?? r.client_id,
    budget_categories: (r) => r.category_id, offers: (r) => r.offer_id,
  };
  function splitTop(s) {
    const out = []; let depth = 0, cur = "";
    for (const c of s) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += c; }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function project(r, sel) {
    const parts = splitTop(sel);
    const out = {};
    for (const part of parts) {
      const m = part.match(/^(\w+)(?:!\w+)?\((.*)\)$/s);
      if (m) {
        const [, rel, inner] = m;
        const fk = REL[rel]?.(r);
        const target = T[rel]?.find((x) => x.id === fk);
        out[rel] = target ? project(target, inner) : null;
      } else if (part === "*") Object.assign(out, r);
      else out[part] = r[part];
    }
    return out;
  }
  const getPath = (r, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), r);
  const likeToRe = (p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");

  class Q {
    constructor(table) { this.table = table; this.op = "select"; this.sel = "*"; this.filters = []; this.orders = []; this.lim = null; this.mode = null; this.head = false; this.ret = false; }
    select(cols = "*", opts = {}) { if (this.op === "select") { this.sel = cols; this.head = Boolean(opts.head); this.count = opts.count; } else { this.ret = true; this.sel = cols; } return this; }
    insert(p) { this.op = "insert"; this.payload = p; return this; }
    upsert(p) { this.op = "upsert"; this.payload = p; return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c, v) { this.filters.push((r) => String(getPath(r, c)) === String(v)); return this; }
    neq(c, v) { this.filters.push((r) => String(getPath(r, c)) !== String(v)); return this; }
    lt(c, v) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
    lte(c, v) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
    gte(c, v) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
    in(c, arr) { this.filters.push((r) => arr.map(String).includes(String(r[c]))); return this; }
    is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
    not(c, op, v) { this.filters.push((r) => (op === "is" && v === null ? r[c] != null : true)); return this; }
    ilike(c, p) { const re = likeToRe(p); this.filters.push((r) => re.test(r[c] ?? "")); return this; }
    or() { return this; }
    order(c, o = {}) { this.orders.push([c, o.ascending !== false, o.nullsFirst]); return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    source() { return views[this.table] ? views[this.table]() : T[this.table]; }
    run() {
      const src = this.source();
      const withRel = (r) => (this.sel.includes("(") ? { ...r, ...project(r, this.sel.split(",").filter((x) => x.includes("(")).join(",")) } : r);
      const match = (r) => this.filters.every((f) => f(withRel(r)));
      let rows;
      if (this.op === "insert" || this.op === "upsert") {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        rows = list.map((p) => {
          if (this.op === "upsert" && p.id) { const ex = T[this.table].find((x) => x.id === p.id); if (ex) { Object.assign(ex, p); return ex; } }
          return row(this.table, p);
        });
      } else if (this.op === "update") {
        rows = src.filter(match);
        for (const r of rows) {
          const wasDone = r.done;
          Object.assign(r, this.payload);
          if (this.table === "tasks") { if (r.done && !wasDone) r.done_at = new Date().toISOString(); if (!r.done) r.done_at = null; syncPhase(r.phase_id); }
        }
      } else if (this.op === "delete") {
        rows = src.filter(match);
        T[this.table] = T[this.table].filter((r) => !rows.includes(r));
        if (this.table === "projects") for (const k of Object.keys(T)) if (k !== "projects") T[k] = T[k].filter((r) => !rows.some((p) => p.id === r.project_id));
        if (this.table === "tasks") rows.forEach((r) => syncPhase(r.phase_id));
      } else rows = src.filter(match);

      if (this.op === "select" && this.head) return { data: null, count: rows.length, error: null };
      for (const [c, asc, nullsFirst] of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[c], y = b[c];
          if (x == null && y == null) return 0;
          if (x == null) return nullsFirst ? -1 : 1;
          if (y == null) return nullsFirst ? 1 : -1;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (this.lim != null) rows = rows.slice(0, this.lim);
      let data = this.op === "select" || this.ret ? rows.map((r) => project(r, this.sel)) : null;
      if (this.mode === "single") {
        if (!data?.length) return { data: null, error: { message: "Kein Datensatz gefunden" } };
        data = data[0];
      } else if (this.mode === "maybe") data = data?.[0] ?? null;
      return { data: JSON.parse(JSON.stringify(data)), error: null, count: rows.length };
    }
    then(res, rej) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }).then(res, rej); } }
  }

  // ---------------------------------------------------------------- Beispieldaten
  T.profiles.push({ owner_id: OWNER, user_name: "Dominik", company_name: "Jonić Raumplanung", email_signature: "Mit freundlichen Grüßen\nDominik Jonić", whatsapp_number: "436641234567", timezone: "Europe/Vienna", briefing_enabled: true, briefing_time: "07:30", reminder_channel: "whatsapp" });
  const kunde = row("contacts", { kind: "kunde", company: "Kanzlei Huber & Partner", name: "Dr. Maria Huber", email: "huber@kanzlei.at", phone: "+43 732 123456", address: "Landstraße 12, 4020 Linz" });
  const kunde2 = row("contacts", { kind: "kunde", company: "Voestalpine IT-Hub", name: "Thomas Berger", email: "t.berger@example.at" });
  const tischler = row("contacts", { kind: "handwerker", company: "Tischlerei Mayr", name: "Josef Mayr", trade: "Tischler", email: "office@tischlerei-mayr.at", phone: "+43 7229 8877" });
  const bene = row("contacts", { kind: "lieferant", company: "Bene Büromöbel", name: "Sandra Kern", trade: "Büromöbel", email: "kern@bene.example" });
  const hali = row("contacts", { kind: "lieferant", company: "Hali Office", trade: "Büromöbel", email: "verkauf@hali.example" });
  row("contacts", { kind: "handwerker", company: "Trockenbau Gruber", trade: "Trockenbau", email: "gruber@example.at" });
  row("contacts", { kind: "spedition", company: "Umzüge Pichler", trade: "Büroumzüge", email: "info@pichler.example" });

  const p1 = row("projects", { name: "Kanzlei Huber – 3. OG", client_id: kunde.id, address: "Hauptplatz 8, 4020 Linz", start_date: d(-40), move_date: d(45), end_date: d(60), budget_total: 185000, workplaces: 24, area_sqm: 620, style: "hell, Eiche natur, Akustikpaneele in Salbeigrün, ruhige Rückzugsboxen" });
  applyTemplate(p1.id);
  const ph1 = T.phases.filter((x) => x.project_id === p1.id).sort((a, b) => a.position - b.position);
  for (const ph of ph1.slice(0, 6)) T.tasks.filter((t) => t.phase_id === ph.id).forEach((t) => { t.done = true; t.done_at = new Date().toISOString(); });
  const vis = T.tasks.filter((t) => t.phase_id === ph1[6].id);
  vis[0].done = true;
  ph1.forEach((ph) => syncPhase(ph.id));
  vis[1].due_date = d(-2);
  vis[2].due_date = d(0);
  const aus = T.tasks.filter((t) => t.phase_id === ph1[7].id);
  aus[0].due_date = d(0);
  row("tasks", { project_id: p1.id, title: "Musterstuhl bei Bene abholen", due_date: d(0), remind_at: at(0, 15) });

  const p2 = row("projects", { name: "IT-Hub Tabakfabrik", client_id: kunde2.id, address: "Peter-Behrens-Platz 2, 4020 Linz", start_date: d(-5), move_date: d(120), budget_total: 420000, workplaces: 60, area_sqm: 1450, style: "Industrial, Sichtbeton, Schwarzstahl, viel Grün" });
  applyTemplate(p2.id);
  T.tasks.filter((t) => t.project_id === p2.id).slice(0, 3).forEach((t) => { t.done = true; });
  T.phases.filter((x) => x.project_id === p2.id).forEach((ph) => syncPhase(ph.id));

  const cat = (pid, name) => T.budget_categories.find((c) => c.project_id === pid && c.name === name);
  row("costs", { project_id: p1.id, category_id: cat(p1.id, "Planung & Honorar").id, kind: "rechnung", title: "Teilrechnung Planung 1", amount: 7400, cost_date: d(-20) });
  row("costs", { project_id: p1.id, category_id: cat(p1.id, "Trockenbau").id, kind: "beauftragt", title: "Trockenbau Gruber", amount: 31200, cost_date: d(-10), contact_id: null });
  row("costs", { project_id: p1.id, category_id: cat(p1.id, "Trockenbau").id, kind: "rechnung", title: "Abschlag Trockenbau", amount: 12000, cost_date: d(-3) });

  const rooms = ["Empfang", "Open Space", "Besprechung groß", "Partnerbüro"];
  [["Elektr. höhenverstellbarer Schreibtisch 160×80", 18, "Bene", "T-PLATFORM", 1450, "Open Space", "Arbeitsplatz"],
   ["Bürodrehstuhl ergonomisch", 24, "Bene", "B_RUN", 690, "Open Space", "Arbeitsplatz"],
   ["Rollcontainer abschließbar", 18, "Bene", "CUBE", 320, "Open Space", "Stauraum"],
   ["Besprechungstisch 320×120 Eiche", 1, "Tischlerei Mayr", "Sonderanfertigung", 6800, "Besprechung groß", "Besprechung"],
   ["Konferenzstuhl", 12, "Hali", "ONE", 410, "Besprechung groß", "Besprechung"],
   ["Akustik-Wandpaneel Salbei 120×60", 36, "Buzzi", "BuzziFelt", 210, "Open Space", "Akustik"],
   ["Empfangstheke", 1, "Tischlerei Mayr", "Sonderanfertigung", 9800, "Empfang", "Empfang"],
   ["Telefonbox 1 Person", 2, "Hali", "Phone Booth", 6900, "Open Space", "Rückzug"],
  ].forEach(([name, q, man, art, price, room, catg], i) => row("items", { project_id: p1.id, name, quantity: q, manufacturer: man, article_no: art, unit_price_est: price, room, category: catg, position: i, source: i < 6 ? "sketchup" : "manuell" }));
  void rooms;

  const t1 = row("tenders", { project_id: p1.id, title: "Büromöbel Arbeitsplätze", category_id: cat(p1.id, "Möbel").id, deadline: d(-1), status: "versendet", description: "Lieferung und Montage inkl. Verpackungsentsorgung, Liefertermin 2 Wochen vor Umzug." });
  const posList = T.items.filter((i) => i.project_id === p1.id && ["Arbeitsplatz", "Stauraum"].includes(i.category))
    .map((i, n) => row("tender_positions", { tender_id: t1.id, item_id: i.id, title: `${i.name} · ${i.manufacturer}`, quantity: i.quantity, unit: "Stk", position: n }));
  [bene, hali, tischler].forEach((c) => row("tender_bidders", { tender_id: t1.id, contact_id: c.id, invited_at: at(-12, 10) }));
  const o1 = row("offers", { tender_id: t1.id, contact_id: bene.id, delivery_weeks: 6, discount_pct: 8, extra_costs: 1800, valid_until: d(20) });
  const o2 = row("offers", { tender_id: t1.id, contact_id: hali.id, delivery_weeks: 9, discount_pct: 3, extra_costs: 950, valid_until: d(25) });
  const o3 = row("offers", { tender_id: t1.id, contact_id: tischler.id, delivery_weeks: 5, discount_pct: 0, extra_costs: 0 });
  const priceSets = [[1490, 640, 335], [1380, 720, 298], [1520, null, 310]];
  [o1, o2, o3].forEach((o, i) => posList.forEach((p, j) => { if (priceSets[i][j] != null) row("offer_prices", { offer_id: o.id, position_id: p.id, unit_price: priceSets[i][j] }); }));

  row("appointments", { project_id: p1.id, title: "Baustellenbesichtigung", kind: "besichtigung", starts_at: at(0, 10), ends_at: at(0, 11), location: "Hauptplatz 8, Linz", google_event_id: "x" });
  row("appointments", { project_id: p1.id, title: "Präsentation Visualisierung", kind: "praesentation", starts_at: at(0, 14, 30), ends_at: at(0, 15, 30), location: "Kanzlei Huber" });
  row("appointments", { project_id: p2.id, title: "Naturmaß Tabakfabrik", kind: "aufmass", starts_at: at(2, 9), ends_at: at(2, 12), location: "Peter-Behrens-Platz 2" });
  row("appointments", { project_id: p1.id, title: "Liefertermin Akustikpaneele", kind: "lieferung", starts_at: at(9, 8), ends_at: at(9, 10) });

  row("logs", { project_id: p1.id, entry_date: d(-2), text: "Trockenbau im 3. OG fertig. Elektriker beginnt Montag mit den Bodentanks. Mangel: Türzarge Besprechungsraum verzogen – Gruber informiert.", source: "ki" });
  row("logs", { project_id: p1.id, entry_date: d(-9), text: "Besichtigung mit Dr. Huber: Farbkonzept Salbeigrün freigegeben, Telefonboxen statt Glaswand.", source: "app" });

  [["3.01", "Empfang", "Empfang", 2, 8, "gruen"], ["3.05", "Open Space", "Steuerberatung", 14, 70, "blau"], ["3.10", "Partnerbüro", "Partner", 2, 16, "lila"]]
    .forEach(([to, from, dep, pers, cr, col], i) => row("move_rooms", { project_id: p1.id, to_room: `${to} ${from}`, from_room: `alt ${i + 1}.0${i + 2}`, department: dep, persons: pers, crates: cr, label_color: col, position: i }));

  row("connectors", { kind: "claude", name: "Claude (KI-Assistent)", mode: "api", config: { model: "claude-opus-5-5", effort: "medium" }, has_secret: true, status: "verbunden", status_message: "Verbunden – Modell Claude Opus 5.5" });
  row("connectors", { kind: "whatsapp", name: "WhatsApp", mode: "api", config: { phone_number_id: "1098765", verify_token: "a1b2c3" }, has_secret: true, status: "fehler", status_message: "Zugriffstoken abgelaufen" });

  row("messages", { channel: "whatsapp", role: "assistant", content: "☀️ Guten Morgen!\n\nHeute: 10:00 Baustellenbesichtigung (Kanzlei Huber), 14:30 Präsentation Visualisierung.\nÜberfällig: Renderings erstellen (seit 2 Tagen).", meta: { push: true }, created_at: at(0, 7, 30) });
  row("messages", { channel: "whatsapp", role: "user", content: "Trockenbau ist fertig, schreib das in die Doku", created_at: at(0, 8, 4) });
  row("messages", { channel: "whatsapp", role: "assistant", content: "Erledigt – Doku-Eintrag bei „Kanzlei Huber – 3. OG“ gespeichert. Soll ich Gruber wegen der Türzarge eine E-Mail entwerfen?", meta: { tools: ["doku_eintrag"] }, created_at: at(0, 8, 5) });

  // ---------------------------------------------------------------- Client
  const session = { access_token: "test", user: { id: OWNER, email: "dominik@firma.at" } };
  const listeners = [];
  window.__mockTables = T;
  window.supabase = {
    createClient() {
      return {
        from: (t) => new Q(t),
        rpc: async (fn, args) => { if (fn === "apply_project_template") applyTemplate(args.p_project); return { data: null, error: null }; },
        auth: {
          getSession: async () => ({ data: { session } }),
          onAuthStateChange: (cb) => { listeners.push(cb); setTimeout(() => cb("INITIAL_SESSION", window.__loggedOut ? null : session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
          signOut: async () => { window.__loggedOut = true; listeners.forEach((cb) => cb("SIGNED_OUT", null)); return { error: null }; },
          signInWithPassword: async () => { window.__loggedOut = false; listeners.forEach((cb) => cb("SIGNED_IN", session)); return { data: { session }, error: null }; },
          signUp: async () => ({ data: { session: null }, error: null }),
          resetPasswordForEmail: async () => ({ data: {}, error: null }),
          updateUser: async () => ({ data: {}, error: null }),
        },
        storage: {
          from: () => ({
            upload: async (path, file) => { (window.__files ??= {})[path] = URL.createObjectURL(file); return { data: { path }, error: null }; },
            createSignedUrl: async (path) => ({ data: { signedUrl: window.__files?.[path] ?? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='3'><rect width='4' height='3' fill='%23bbb'/></svg>" }, error: null }),
            remove: async () => ({ data: null, error: null }),
          }),
        },
      };
    },
  };
})();
