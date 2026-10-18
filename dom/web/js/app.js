// App-Rahmen: Anmeldung, Split View (Sidebar) / Tab-Bar, Hash-Router.
import { db, q, setUser } from "./supa.js";
import { icon } from "./icons.js";
import { errorToast, esc, loading, segmented, watchScroll } from "./ui.js";
import { enterView, moveIndicators } from "./motion.js";

const NAV = [
  { key: "heute", label: "Heute", icon: "today" },
  { key: "projekte", label: "Projekte", icon: "projects" },
  { key: "termine", label: "Kalender", icon: "calendar" },
  { key: "assistent", label: "Assistent", icon: "assistant" },
  { key: "kontakte", label: "Kontakte", icon: "contacts" },
];

const ROUTES = [
  [/^\/heute$/, () => import("./views/today.js")],
  [/^\/projekte$/, () => import("./views/projects.js"), "list"],
  [/^\/projekte\/([0-9a-f-]{36})$/, () => import("./views/projects.js"), "detail"],
  [/^\/projekte\/([0-9a-f-]{36})\/budget$/, () => import("./views/budget.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/stueckliste$/, () => import("./views/items.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/ausschreibungen$/, () => import("./views/tenders.js"), "list"],
  [/^\/projekte\/([0-9a-f-]{36})\/ausschreibungen\/([0-9a-f-]{36})$/, () => import("./views/tenders.js"), "detail"],
  [/^\/projekte\/([0-9a-f-]{36})\/termine$/, () => import("./views/appointments.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/doku$/, () => import("./views/journal.js"), "journal"],
  [/^\/projekte\/([0-9a-f-]{36})\/dateien$/, () => import("./views/journal.js"), "files"],
  [/^\/projekte\/([0-9a-f-]{36})\/umzug$/, () => import("./views/move.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/maengel$/, () => import("./views/defects.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/zeiten$/, () => import("./views/time.js")],
  [/^\/projekte\/([0-9a-f-]{36})\/freigaben$/, () => import("./views/approvals.js")],
  [/^\/termine$/, () => import("./views/calendar.js")],
  [/^\/assistent$/, () => import("./views/assistant.js")],
  [/^\/kontakte$/, () => import("./views/contacts.js")],
  [/^\/einstellungen$/, () => import("./views/settings.js"), "settings"],
  [/^\/einstellungen\/konnektoren$/, () => import("./views/settings.js"), "connectors"],
  [/^\/einstellungen\/vorlagen$/, () => import("./views/settings.js"), "templates"],
];

const appEl = document.getElementById("app");

function shell() {
  const navLinks = (cls) => NAV.map((n) => `<a href="#/${n.key}" data-nav="${n.key}" class="${cls}">${icon(n.icon)}<span>${n.label}</span></a>`).join("");
  appEl.innerHTML = `
    <div class="app">
      <nav class="sidebar glass" aria-label="Bereiche">
        <a class="brand" href="#/heute" aria-label="DOM – Heute"><img class="logo" src="icons/logo-glass.png" alt="DOM"></a>
        ${navLinks("")}
        <div class="spacer"></div>
        <a href="#/einstellungen" data-nav="einstellungen">${icon("settings")}<span>Einstellungen</span></a>
      </nav>
      <main class="content" id="main" tabindex="-1"></main>
      <nav class="tabbar glass" aria-label="Bereiche">${navLinks("")}</nav>
    </div>`;
}

function setActive(section) {
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  requestAnimationFrame(moveIndicators);
}

let renderToken = 0;
let lastPath = null;
async function route() {
  const hash = location.hash.replace(/^#/, "") || "/heute";
  const [path, query] = hash.split("?");
  const section = path.split("/")[1];
  setActive(section === "einstellungen" ? "einstellungen" : section);
  const main = document.getElementById("main");
  const match = ROUTES.find(([re]) => re.test(path));
  if (!match) { location.hash = "#/heute"; return; }
  const token = ++renderToken;
  const isNav = path !== lastPath;
  lastPath = path;
  // Neue Ansicht abseits aufbauen und erst fertig einsetzen – kein Flackern beim Aktualisieren.
  const root = document.createElement("div");
  const spinner = setTimeout(() => { if (token === renderToken) main.innerHTML = loading(); }, isNav ? 160 : 600);
  try {
    const mod = await match[1]();
    if (token !== renderToken) return;
    const params = path.match(match[0]).slice(1);
    const ctx = {
      root, params, mode: match[2], query: new URLSearchParams(query ?? ""),
      rerender: () => { if (token === renderToken) route(); },
    };
    await mod.default(ctx);
    if (token !== renderToken) return;
    clearTimeout(spinner);
    const y = window.scrollY;
    main.replaceChildren(root);
    if (isNav) { window.scrollTo(0, 0); enterView(root); } else window.scrollTo(0, y);
    watchScroll();
  } catch (e) {
    clearTimeout(spinner);
    if (token !== renderToken) return;
    root.innerHTML = `<div class="page"><div class="empty">${icon("warning")}<h3>Konnte nicht geladen werden</h3><p>${esc(e.message)}</p>
      <button class="btn btn-tinted" onclick="location.reload()">Erneut versuchen</button></div></div>`;
    main.replaceChildren(root);
    console.error(e);
  }
}

// ---------------------------------------------------------------- Anmeldung

function loginView() {
  let mode = "login";
  const draw = () => {
    appEl.innerHTML = `
      <div class="login"><div class="box">
        <img class="logo login-logo" src="icons/logo-glass.png" alt="DOM">
        <h1 class="t-title1">${mode === "login" ? "Willkommen zurück" : "Konto erstellen"}</h1>
        <p class="lead">Büromöblierung & Umzugskoordination – Projekte, Budget, Angebote und Termine an einem Ort.</p>
        ${segmented("mode", [["login", "Anmelden"], ["signup", "Registrieren"]], mode, true)}
        <form class="stack" id="login-form">
          <ul class="list form-list">
            <li><div class="field"><label for="email">E-Mail</label><input id="email" type="email" autocomplete="email" required placeholder="name@firma.at"></div></li>
            <li><div class="field"><label for="pw">Passwort</label><input id="pw" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="8" placeholder="${mode === "login" ? "" : "mind. 8 Zeichen"}"></div></li>
          </ul>
          <p class="group-footer critical" id="login-error" hidden></p>
          <button class="btn btn-filled block" type="submit">${mode === "login" ? "Anmelden" : "Konto erstellen"}</button>
          ${mode === "login" ? '<button class="btn btn-plain" type="button" id="reset">Passwort vergessen?</button>' : ""}
        </form>
      </div></div>`;
    appEl.querySelector("[data-seg]").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { mode = b.dataset.value; draw(); }
    });
    const err = appEl.querySelector("#login-error");
    appEl.querySelector("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = appEl.querySelector("#email").value.trim();
      const password = appEl.querySelector("#pw").value;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      err.hidden = true;
      try {
        if (mode === "login") {
          await q(db.auth.signInWithPassword({ email, password }));
        } else {
          const res = await q(db.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
          if (!res.session) {
            err.textContent = "Fast geschafft: Bitte bestätige die E-Mail, die wir dir gerade geschickt haben, und melde dich dann an.";
            err.classList.remove("critical");
            err.hidden = false;
          }
        }
      } catch (ex) {
        err.textContent = /Invalid login/i.test(ex.message) ? "E-Mail oder Passwort stimmt nicht." : ex.message;
        err.classList.add("critical");
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    appEl.querySelector("#reset")?.addEventListener("click", async () => {
      const email = appEl.querySelector("#email").value.trim();
      if (!email) { err.textContent = "Gib zuerst deine E-Mail-Adresse ein."; err.hidden = false; return; }
      try {
        await q(db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
        err.textContent = "Wir haben dir einen Link zum Zurücksetzen geschickt.";
        err.classList.remove("critical");
        err.hidden = false;
      } catch (ex) { errorToast(ex); }
    });
  };
  draw();
}

// ---------------------------------------------------------------- Start

let started = false;
async function start(session) {
  if (!session) { started = false; setUser(null); loginView(); return; }
  setUser(session.user);
  if (started) return;
  started = true;
  shell();
  window.addEventListener("hashchange", route);
  await route();
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    const pw = prompt("Neues Passwort (mind. 8 Zeichen):");
    if (pw) db.auth.updateUser({ password: pw }).then(() => alert("Passwort geändert."));
  }
  if (event === "SIGNED_OUT") { started = false; window.removeEventListener("hashchange", route); }
  start(session);
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
