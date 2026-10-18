// UI-Bausteine nach Apple HIG: Sheets, Alerts, Action Sheets, Toasts, Listenzeilen, Fortschritt, Formate.
import { icon } from "./icons.js";

// ---------------------------------------------------------------- Formate (de-AT)

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const eurFmt = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurFmt2 = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
export const eur = (n, cents = false) => (n == null || n === "" ? "–" : (cents ? eurFmt2 : eurFmt).format(Number(n)));
export const num = (n) => (n == null ? "–" : new Intl.NumberFormat("de-AT", { maximumFractionDigits: 2 }).format(Number(n)));

export function toDate(d) {
  if (!d) return null;
  return typeof d === "string" && d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
}
export const fmtDate = (d, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  d ? new Intl.DateTimeFormat("de-AT", opts).format(toDate(d)) : "–";
export const fmtTime = (d) => (d ? new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "");
export const fmtDateLong = (d) => fmtDate(d, { weekday: "long", day: "numeric", month: "long" });

export function isoDate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function addDays(dateStr, days) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
/** Lokale Eingabe "YYYY-MM-DDTHH:MM" für datetime-local aus ISO-Zeit. */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function relDay(d) {
  if (!d) return "";
  const today = isoDate();
  const day = typeof d === "string" && d.length === 10 ? d : isoDate(new Date(d));
  if (day === today) return "Heute";
  if (day === addDays(today, 1)) return "Morgen";
  if (day === addDays(today, -1)) return "Gestern";
  return fmtDate(day);
}

// ---------------------------------------------------------------- Kleine Bausteine

export function ring(pct, size = 40, color = "var(--accent)") {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<span class="ring" style="--size:${size}px" role="img" aria-label="${p} Prozent erledigt">
    <svg viewBox="0 0 ${size} ${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" style="stroke:${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/></svg>
    <span class="pct">${p}</span></span>`;
}

export function progress(pct, tone = "") {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="progress ${tone}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div>`;
}

export const BUDGET_STATE = {
  im_budget: { label: "Im Budget", tone: "positive", icon: "check" },
  knapp: { label: "Knapp", tone: "warning", icon: "warning" },
  ueberschritten: { label: "Überschritten", tone: "critical", icon: "warning" },
  offen: { label: "Kein Budget", tone: "", icon: "info" },
};
/** Zeitplan-Ampel eines Projekts: rot = Phase überzogen oder ≥ 3 Aufgaben überfällig, gelb = etwas überfällig oder Phasenende in ≤ 3 Tagen. */
export function scheduleState(p) {
  if (p.status && p.status !== "aktiv") return null;
  const today = isoDate();
  if ((p.current_phase_due && p.current_phase_due < today) || p.overdue >= 3) return "rot";
  if (p.overdue > 0 || (p.current_phase_due && p.current_phase_due <= addDays(today, 3))) return "gelb";
  return "gruen";
}
const SCHEDULE = { rot: ["Zeitverzug", "critical", "warning"], gelb: ["Achtung", "warning", "clock"], gruen: ["Im Zeitplan", "positive", "check"] };
export function schedulePill(p) {
  const st = scheduleState(p);
  if (!st) return "";
  const [label, tone, ic] = SCHEDULE[st];
  return `<span class="pill ${tone}">${icon(ic)}${label}</span>`;
}

export function budgetPill(state) {
  const s = BUDGET_STATE[state] ?? BUDGET_STATE.offen;
  return `<span class="pill ${s.tone}">${icon(s.icon)}${s.label}</span>`;
}

export function empty({ icon: ic = "info", title, text = "", action = "" }) {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
}

export const loading = () => `<div class="center-load"><div class="spinner" role="status" aria-label="Wird geladen"></div></div>`;

/** Navigationsleiste + Large Title (HIG: Titel = Bereich, Zurück leading, Aktionen trailing). */
export function header({ title, subtitle = "", back = null, actions = "", largeExtra = "" }) {
  return `
  <header class="navbar">
    <div class="nav-leading">${back ? `<a class="nav-back" href="${back.href}">${icon("chevronLeft")}<span>${esc(back.label.length > 22 ? "Zurück" : back.label)}</span></a>` : '<a class="nav-logo" href="#/heute" aria-label="DOM – Heute"><img class="logo" src="icons/logo-glass.png" alt=""></a>'}</div>
    <div class="nav-title" aria-hidden="true">${esc(title)}</div>
    <div class="nav-actions">${actions}</div>
  </header>
  <div class="page"><div class="large-title-wrap">
    <div><h1 class="t-large-title">${esc(title)}</h1>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}</div>${largeExtra}
  </div></div>`;
}

export function navButton(action, ic, label) {
  return `<button class="icon-btn" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic)}</button>`;
}

export function segmented(name, options, selected, full = false) {
  return `<div class="segmented ${full ? "full" : ""}" role="tablist" data-seg="${name}">${options
    .map(([v, l]) => `<button role="tab" data-value="${v}" aria-selected="${v === selected}">${esc(l)}</button>`)
    .join("")}</div>`;
}

// ---------------------------------------------------------------- Dialog-Host

function host(dialog) {
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return dialog;
}

/** Alert (HIG: nur kritisch; konkrete Buttons; destruktiv rot + Abbrechen). Liefert true/false. */
export function confirmDialog({ title, message = "", confirm = "OK", destructive = false, cancel = "Abbrechen" }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "alert";
    d.setAttribute("role", "alertdialog");
    d.innerHTML = `<div class="alert-body"><h2>${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ""}</div>
      <div class="alert-actions"><button value="0">${esc(cancel)}</button>
      <button value="1" class="${destructive ? "destructive" : "bold"}">${esc(confirm)}</button></div>`;
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { d.close(); resolve(b.value === "1"); }
    });
    d.addEventListener("cancel", () => resolve(false));
    host(d);
    d.querySelector('button[value="1"]').focus();
  });
}

/** Action Sheet (Auswahl zu einer bewussten Aktion). actions: [{label, value, destructive}] */
export function actionSheet({ title = "", actions }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "action-sheet";
    d.innerHTML = `<div class="as-group">${title ? `<div class="as-title">${esc(title)}</div>` : ""}${actions
      .map((a, i) => `<button data-i="${i}" class="${a.destructive ? "destructive" : ""}">${esc(a.label)}</button>`).join("")}</div>
      <div class="as-group"><button class="cancel" data-i="-1">Abbrechen</button></div>`;
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { d.close(); const i = Number(b.dataset.i); resolve(i >= 0 ? actions[i].value ?? actions[i].label : null); }
      else if (e.target === d) { d.close(); resolve(null); }
    });
    d.addEventListener("cancel", () => resolve(null));
    host(d);
  });
}

// ---------------------------------------------------------------- Toast mit Rückgängig

export function toast(message, { undo = null, duration = 5000 } = {}) {
  let hostEl = document.querySelector(".toast-host");
  if (!hostEl) {
    hostEl = document.createElement("div");
    hostEl.className = "toast-host";
    hostEl.setAttribute("role", "status");
    hostEl.setAttribute("aria-live", "polite");
    document.body.appendChild(hostEl);
  }
  hostEl.innerHTML = "";
  const t = document.createElement("div");
  t.className = "toast glass";
  t.innerHTML = `<span>${esc(message)}</span>${undo ? '<button class="btn-plain">Rückgängig</button>' : ""}`;
  hostEl.appendChild(t);
  const timer = setTimeout(() => t.remove(), duration);
  if (undo) t.querySelector("button").addEventListener("click", () => { clearTimeout(timer); t.remove(); undo(); });
}

export function errorToast(e) {
  console.error(e);
  toast(e?.message ? `Fehler: ${e.message}` : "Etwas ist schiefgelaufen.", { duration: 7000 });
}

// ---------------------------------------------------------------- Formular-Sheet

function fieldHtml(f, value) {
  const id = `f-${f.name}`;
  const v = value ?? f.value ?? "";
  const req = f.required ? "required" : "";
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "";
  const common = `id="${id}" name="${f.name}" ${req} ${ph} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ""}`;
  let input;
  switch (f.type) {
    case "textarea":
      return `<li><div class="field stacked"><label for="${id}">${esc(f.label)}</label><textarea ${common} rows="${f.rows ?? 4}">${esc(v)}</textarea></div></li>`;
    case "select":
      input = `<select ${common}>${(f.options ?? []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${esc(ol)}</option>`).join("")}</select>`;
      break;
    case "switch":
      input = `<input type="checkbox" class="switch" role="switch" ${common} ${v ? "checked" : ""}>`;
      break;
    case "money":
      input = `<input type="text" inputmode="decimal" ${common} value="${v === "" || v == null ? "" : esc(String(v).replace(".", ","))}">`;
      break;
    case "number":
      input = `<input type="text" inputmode="decimal" ${common} value="${v === "" || v == null ? "" : esc(String(v).replace(".", ","))}">`;
      break;
    case "secret":
      input = `<input type="password" ${common} value="" autocomplete="off" placeholder="${f.hasValue ? "•••••••• (gespeichert)" : esc(f.placeholder ?? "")}">`;
      break;
    case "file":
      input = `<input type="file" ${common} ${f.accept ? `accept="${f.accept}"` : ""} ${f.multiple ? "multiple" : ""}>`;
      break;
    default:
      input = `<input type="${f.type ?? "text"}" ${common} value="${esc(v)}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ""}>`;
  }
  if (f.stacked) return `<li><div class="field stacked"><label for="${id}">${esc(f.label)}</label>${input}</div></li>`;
  return `<li><div class="field"><label for="${id}">${esc(f.label)}</label>${input}${f.suffix ? `<span class="suffix">${esc(f.suffix)}</span>` : ""}</div></li>`;
}

export function parseNumber(s) {
  if (s == null || String(s).trim() === "") return null;
  const t = String(s).replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Sheet mit gruppiertem Formular.
 * sections: [{ header, footer, fields: [{name,label,type,...}], html }]
 * onSubmit(values) → bei Fehler wird die Meldung angezeigt und das Sheet bleibt offen.
 */
export function formSheet({ title, confirm = "Sichern", sections, values = {}, wide = false, onSubmit, destructive = null }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = `sheet ${wide ? "wide" : ""}`;
    d.setAttribute("aria-labelledby", "sheet-title");
    const allFields = sections.flatMap((s) => s.fields ?? []);
    d.innerHTML = `
      <div class="grabber" aria-hidden="true"></div>
      <header class="sheet-bar">
        <button type="button" class="btn btn-plain" data-sheet="cancel">Abbrechen</button>
        <h2 id="sheet-title">${esc(title)}</h2>
        <button type="submit" form="sheet-form" class="btn btn-plain bold" data-sheet="ok">${esc(confirm)}</button>
      </header>
      <div class="sheet-body">
        <form id="sheet-form" novalidate>
          ${sections.map((s) => `
            <section class="group">
              ${s.header ? `<h3 class="group-header small">${esc(s.header)}</h3>` : ""}
              ${s.html ?? `<ul class="list form-list">${(s.fields ?? []).map((f) => fieldHtml(f, values[f.name])).join("")}</ul>`}
              ${s.footer ? `<p class="group-footer">${s.footer}</p>` : ""}
            </section>`).join("")}
          <p class="group-footer critical" data-error hidden></p>
          ${destructive ? `<section class="group"><button type="button" class="btn btn-destructive block" data-sheet="destroy">${esc(destructive.label)}</button></section>` : ""}
        </form>
      </div>`;
    host(d);
    const form = d.querySelector("form");
    const errorEl = d.querySelector("[data-error]");
    const okBtn = d.querySelector('[data-sheet="ok"]');
    let dirty = false;
    form.addEventListener("input", () => { dirty = true; validate(); });

    function collect() {
      const out = {};
      for (const f of allFields) {
        const el = form.elements[f.name];
        if (!el) continue;
        if (f.type === "switch") out[f.name] = el.checked;
        else if (f.type === "file") out[f.name] = el.files;
        else if (f.type === "money" || f.type === "number") out[f.name] = parseNumber(el.value);
        else if (f.type === "secret") out[f.name] = el.value || undefined;
        else out[f.name] = el.value.trim() === "" ? null : el.value.trim();
      }
      return out;
    }
    function validate() {
      const v = collect();
      const ok = allFields.every((f) => !f.required || (v[f.name] != null && v[f.name] !== "" && !Number.isNaN(v[f.name])))
        && allFields.every((f) => !(f.type === "money" || f.type === "number") || !Number.isNaN(v[f.name]));
      okBtn.disabled = !ok;
      return ok;
    }
    validate();

    async function close(result) {
      d.close();
      resolve(result);
    }
    async function cancel() {
      if (dirty) {
        const choice = await actionSheet({ actions: [{ label: "Änderungen verwerfen", value: "discard", destructive: true }] });
        if (choice !== "discard") return;
      }
      close(null);
    }

    d.addEventListener("cancel", (e) => { e.preventDefault(); cancel(); });
    d.querySelector('[data-sheet="cancel"]').addEventListener("click", cancel);
    d.addEventListener("click", (e) => { if (e.target === d && !dirty) close(null); });
    d.querySelector('[data-sheet="destroy"]')?.addEventListener("click", async () => {
      if (await confirmDialog({ title: destructive.confirmTitle ?? "Wirklich löschen?", message: destructive.message ?? "", confirm: "Löschen", destructive: true })) {
        try { await destructive.onConfirm(); close("deleted"); } catch (e) { errorToast(e); }
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate()) return;
      okBtn.disabled = true;
      okBtn.innerHTML = '<span class="spinner"></span>';
      errorEl.hidden = true;
      try {
        const values = collect();
        const res = onSubmit ? await onSubmit(values) : values;
        close(res ?? values);
      } catch (err) {
        console.error(err);
        errorEl.textContent = err.message ?? String(err);
        errorEl.hidden = false;
        okBtn.textContent = confirm;
        okBtn.disabled = false;
      }
    });
    setTimeout(() => form.querySelector("input:not([type=checkbox]):not([type=file]), textarea")?.focus(), 60);
  });
}

/** Einfaches Inhalts-Sheet (nur „Fertig“), z. B. für Vorschauen. */
export function contentSheet({ title, html, wide = false, onReady }) {
  const d = document.createElement("dialog");
  d.className = `sheet ${wide ? "wide" : ""}`;
  d.innerHTML = `<div class="grabber"></div><header class="sheet-bar"><span></span><h2>${esc(title)}</h2>
    <button class="btn btn-plain bold" data-sheet="done">Fertig</button></header><div class="sheet-body">${html}</div>`;
  host(d);
  d.querySelector('[data-sheet="done"]').addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  onReady?.(d);
  return d;
}

/** Scroll-Edge-Effekt: Navigationsleiste bekommt Material, sobald Inhalt darunter scrollt. */
export function watchScroll() {
  const nav = document.querySelector(".navbar");
  if (!nav) return;
  const on = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  window.removeEventListener("scroll", window.__domScroll ?? (() => {}));
  window.__domScroll = on;
  window.addEventListener("scroll", on, { passive: true });
  on();
}

export function downloadFile(name, content, type = "text/csv;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
