// Datenbankzugriff für die Edge Function.
// Der Admin-Client umgeht RLS – deshalb filtert jede Abfrage ausdrücklich nach owner_id.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/dom`;

export const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Liefert die Benutzer-ID aus dem Bearer-Token der App oder null. */
export async function userFromRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Wirft bei Datenbankfehlern, damit Fehler nicht stillschweigend verschluckt werden. */
// deno-lint-ignore no-explicit-any
export function must(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function internalSetting(key: string): Promise<string> {
  const row = must(await admin.from("internal_settings").select("value").eq("key", key).single());
  return row.value;
}

export async function getProfile(owner: string) {
  return must(await admin.from("profiles").select("*").eq("owner_id", owner).single());
}

// ---------------------------------------------------------------- Formatierung (de-AT)

export const TZ_DEFAULT = "Europe/Vienna";

export function eur(n: number | string | null | undefined): string {
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
    .format(Number(n ?? 0));
}

export function dateDE(d: string | Date | null | undefined, tz = TZ_DEFAULT): string {
  if (!d) return "–";
  const date = typeof d === "string" && d.length === 10 ? new Date(d + "T12:00:00Z") : new Date(d);
  return new Intl.DateTimeFormat("de-AT", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(date);
}

export function timeDE(d: string | Date, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(d));
}

/** Datum (YYYY-MM-DD) und Uhrzeit (HH:MM) „jetzt“ in der Zeitzone des Benutzers. */
export function localNow(tz = TZ_DEFAULT): { date: string; time: string; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const weekday = new Intl.DateTimeFormat("de-AT", { weekday: "long", timeZone: tz }).format(new Date());
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday };
}

/** Wandelt eine lokale Zeitangabe („2026-10-20T09:30“) der Zeitzone in einen ISO-Zeitstempel um. */
export function localToIso(local: string, tz = TZ_DEFAULT): string {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(local)) return new Date(local).toISOString();
  const base = local.length === 10 ? `${local}T09:00` : local.slice(0, 16);
  const guess = new Date(`${base}:00Z`);
  const asLocal = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const offset = asLocal.getTime() - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}
