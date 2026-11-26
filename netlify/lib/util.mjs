import { randomBytes } from "node:crypto";

export const SITE = () => (process.env.URL || "https://thatsjustgood.com").replace(/\/$/, "");
export const TZ = "America/Chicago";

export const token = (bytes = 18) => randomBytes(bytes).toString("base64url");

// Short, unambiguous codes for people to read aloud (no 0/O, 1/I/L)
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function code(len = 6) {
  const b = randomBytes(len);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
}

export function fmtDate(iso, opts = {}) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric", ...opts });
}
export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}
export function fmtWhen(startIso, endIso) {
  return `${fmtDate(startIso)}, ${fmtTime(startIso)} to ${fmtTime(endIso)}`;
}

/** Convert a local Dallas date + time ("2026-12-12", "10:00") to an ISO timestamp. */
export function centralToIso(date, time = "10:00") {
  // Find the UTC offset for that local date in Chicago (handles daylight saving)
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(guess);
  const off = (parts.find((p) => p.type === "timeZoneName")?.value || "GMT-6").replace("GMT", "");
  const m = off.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  const sign = m && m[1] === "-" ? -1 : 1;
  const mins = m ? sign * (Number(m[2]) * 60 + Number(m[3] || 0)) : -360;
  return new Date(guess.getTime() - mins * 60000).toISOString();
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ""));

export function cleanPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}

export function hoursFor(ev) {
  return Math.round(((new Date(ev.ends_at) - new Date(ev.starts_at)) / 3600000) * 10) / 10;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}
export function fail(message, status = 400) {
  return json({ error: message }, status);
}
