// Bewegung & Darstellung: gleitende Navigations-Linse, gestaffelter Seitenaufbau, hochzählende Kennzahlen,
// Zeiger-Lichtkegel, Hell/Dunkel-Umschaltung. Alles respektiert „Bewegung reduzieren“.

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- Navigations-Linse

/** Schiebt die Auswahl-Linse in Sidebar/Tab-Bar unter den aktiven Eintrag. */
export function moveIndicators() {
  for (const nav of document.querySelectorAll(".sidebar, .tabbar")) {
    if (!nav.offsetParent && getComputedStyle(nav).display === "none") continue;
    let ind = nav.querySelector(":scope > .nav-indicator");
    if (!ind) {
      ind = document.createElement("span");
      ind.className = "nav-indicator";
      ind.setAttribute("aria-hidden", "true");
      nav.prepend(ind);
    }
    const active = nav.querySelector('a[aria-current="page"]:not(.brand)');
    if (!active) { ind.classList.remove("on"); continue; }
    const first = !ind.classList.contains("on");
    if (first) ind.style.transition = "none";
    ind.style.width = `${active.offsetWidth}px`;
    ind.style.height = `${active.offsetHeight}px`;
    ind.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    ind.classList.add("on");
    if (first) { ind.offsetWidth; ind.style.transition = ""; }
  }
}
addEventListener("resize", () => requestAnimationFrame(moveIndicators));

// ---------------------------------------------------------------- Seitenaufbau

/** Gestaffelter Aufbau einer neu betretenen Ansicht. Nach dem Auftritt wird alles wieder „statisch“. */
export function enterView(root) {
  if (!root) return;
  let i = 0;
  root.querySelectorAll(":scope > .page").forEach((page) => {
    for (const child of page.children) {
      child.style.setProperty("--i", String(Math.min(i++, 12)));
      child.querySelectorAll(".list").forEach((list) => {
        [...list.children].slice(0, 14).forEach((li, j) => li.style.setProperty("--j", String(j)));
      });
    }
  });
  root.classList.add("view-enter");
  countUp(root);
  // Animationen entfernen, damit keine Transform-/Filter-Ebenen hängen bleiben (Glas, fixierte Elemente)
  setTimeout(() => root.classList.remove("view-enter"), 1500);
}

// ---------------------------------------------------------------- Kennzahlen zählen hoch

const nf = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 });

function countUp(root) {
  if (reducedMotion()) return;
  for (const el of root.querySelectorAll(".metric .value")) {
    if (el.children.length) continue;
    const m = el.textContent.trim().match(/^(€\s?)?([\d.]+(?:,\d+)?)(\s?(?:h|%|€))?$/);
    if (!m) continue;
    const target = Number(m[2].replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(target) || target === 0) continue;
    const decimals = m[2].includes(",") ? 1 : 0;
    const fmt = (v) => `${m[1] ?? ""}${decimals ? nf.format(v) : Math.round(v).toLocaleString("de-AT")}${m[3] ?? ""}`;
    const final = el.textContent;
    const start = performance.now() + 120;
    const dur = Math.min(1200, 500 + Math.log10(target + 1) * 160);
    el.textContent = fmt(0);
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      const e = 1 - Math.pow(1 - t, 4);
      el.textContent = t >= 1 ? final : fmt(target * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---------------------------------------------------------------- Zeiger-Lichtkegel

if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(".metric, .list, .card");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });
}

// ---------------------------------------------------------------- Dialoge & Hinweise: weich ausblenden

/** Ersetzt dialog.close() durch eine kurze Ausblende-Animation. */
export function animateClose(dialog) {
  const close = dialog.close.bind(dialog);
  dialog.close = (value) => {
    if (!dialog.open || dialog.classList.contains("closing") || reducedMotion()) return close(value);
    dialog.classList.add("closing");
    setTimeout(() => close(value), 190);
  };
}

export function removeToast(t) {
  if (reducedMotion()) return t.remove();
  t.classList.add("out");
  setTimeout(() => t.remove(), 220);
}

// ---------------------------------------------------------------- Hell / Dunkel

const THEME_KEY = "dom-theme";

export function themePreference() {
  try { return localStorage.getItem(THEME_KEY) || "auto"; } catch { return "auto"; }
}

function paintTheme(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.dataset.theme = pref;
  else delete root.dataset.theme;
  const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0b0c0e" : "#f2f3f5"));
}

/** Setzt die Darstellung (auto | light | dark) – mit weicher Überblendung, wo der Browser es kann. */
export function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* privat */ }
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(() => paintTheme(pref));
  else paintTheme(pref);
}

paintTheme(themePreference());
