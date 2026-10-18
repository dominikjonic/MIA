// Assistent: Chat mit der KI (gleicher Verlauf wie WhatsApp).
import { api, db, q } from "../supa.js";
import { icon } from "../icons.js";
import { errorToast, esc, fmtDateLong, fmtTime, header, isoDate } from "../ui.js";

const SUGGESTIONS = [
  "Was steht heute an?",
  "Wie weit sind meine Projekte?",
  "Wo wird das Budget knapp?",
  "Erinnere mich morgen um 9 an die Angebotsfrist",
];

function bubble(m) {
  const me = m.role === "user";
  const tools = m.meta?.tools?.length ? ` · ${m.meta.tools.length} Aktion${m.meta.tools.length > 1 ? "en" : ""}` : "";
  return `<div class="bubble-meta ${me ? "me" : ""}">${me ? "Du" : "Assistent"}${m.channel === "whatsapp" ? " · WhatsApp" : ""}${m.meta?.push ? " · Hinweis" : ""}${tools} · ${fmtTime(m.created_at)}</div>
    <div class="bubble ${me ? "me" : "ai"}">${esc(m.content).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, "$1<b>$2</b>")}</div>`;
}

export default async function assistant(ctx) {
  const rows = (await q(db.from("messages").select("*").neq("channel", "system").order("created_at", { ascending: false }).limit(80))).reverse();
  const preset = ctx.query.get("projekt");

  let lastDay = "";
  const thread = rows.map((m) => {
    const day = isoDate(new Date(m.created_at));
    const sep = day !== lastDay ? `<div class="chat-day">${day === isoDate() ? "Heute" : fmtDateLong(day)}</div>` : "";
    lastDay = day;
    return sep + bubble(m);
  }).join("");

  ctx.root.innerHTML = `
    ${header({ title: "Assistent", subtitle: "Fragt, plant, erinnert und schreibt E-Mails – auch per WhatsApp." })}
    <div class="page narrow">
      ${rows.length ? "" : `<div class="card stack mb-16"><div class="row">${icon("assistant", "lg")}<span class="t-headline">Wie kann ich helfen?</span></div>
        <div class="t-subhead secondary">Ich kenne deine Projekte, Aufgaben, Budgets, Angebote und Termine. Sag mir, was erledigt ist, frag nach dem Stand oder lass mich E-Mails formulieren.</div></div>`}
      <div class="chat" data-thread aria-live="polite">${thread}</div>
      <div class="suggestions" data-suggestions>${(preset ? [`Wie ist der Stand bei ${preset}?`, `Was ist bei ${preset} als Nächstes zu tun?`, `Budget von ${preset}`] : SUGGESTIONS)
        .map((s) => `<button>${esc(s)}</button>`).join("")}</div>
    </div>
    <form class="composer glass" data-composer>
      <textarea rows="1" placeholder="Nachricht an den Assistenten" aria-label="Nachricht"></textarea>
      <button class="send" type="submit" disabled aria-label="Senden">${icon("send")}</button>
    </form>`;

  const threadEl = ctx.root.querySelector("[data-thread]");
  const form = ctx.root.querySelector("[data-composer]");
  const ta = form.querySelector("textarea");
  const sendBtn = form.querySelector(".send");
  const scrollDown = () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  requestAnimationFrame(() => requestAnimationFrame(scrollDown));

  const resize = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; sendBtn.disabled = !ta.value.trim(); };
  ta.addEventListener("input", resize);
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  async function send(text) {
    ctx.root.querySelector("[data-suggestions]").hidden = true;
    const now = new Date().toISOString();
    threadEl.insertAdjacentHTML("beforeend", bubble({ role: "user", content: text, created_at: now, channel: "app" }));
    threadEl.insertAdjacentHTML("beforeend", `<div class="bubble ai" data-typing><span class="spinner" style="width:16px;height:16px;display:inline-block;vertical-align:-3px"></span> Denkt nach …</div>`);
    scrollDown();
    try {
      const r = await api("/assistant", { message: text });
      threadEl.querySelector("[data-typing]")?.remove();
      threadEl.insertAdjacentHTML("beforeend", bubble({ role: "assistant", content: r.reply, created_at: new Date().toISOString(), channel: "app", meta: { tools: r.tools_used } }));
      if (r.setup_needed) {
        threadEl.insertAdjacentHTML("beforeend", `<a class="btn btn-tinted small" style="align-self:flex-start" href="#/einstellungen/konnektoren">${icon("plug", "sm")}Konnektoren öffnen</a>`);
      }
    } catch (e) {
      threadEl.querySelector("[data-typing]")?.remove();
      threadEl.insertAdjacentHTML("beforeend", `<div class="bubble ai critical">Das hat nicht geklappt: ${esc(e.message)}</div>`);
      errorToast(e);
    }
    scrollDown();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    ta.value = "";
    resize();
    send(text);
  });
  ctx.root.querySelector("[data-suggestions]").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) send(b.textContent);
  });
}
