// Calendar invite (.ics) for an event, so attendees can add it in one tap.
import { SITE } from "./util.mjs";

const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escIcs = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line) => {
  const out = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
  out.push(s);
  return out.join("\r\n");
};

export function eventIcs(ev, { url, method = "PUBLISH" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//That's Just Good//Events//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${ev.id}@thatsjustgood.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`,
    `DTEND:${stamp(ev.ends_at)}`,
    `SUMMARY:${escIcs(ev.title)}`,
    `DESCRIPTION:${escIcs((ev.summary || "") + (url ? `\n\nDetails: ${url}` : ""))}`,
    `LOCATION:${escIcs([ev.venue_name, ev.address].filter(Boolean).join(", "))}`,
    `URL:${url || SITE()}`,
    "ORGANIZER;CN=That's Just Good:mailto:dogood@thatsjustgood.com",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${escIcs(ev.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
