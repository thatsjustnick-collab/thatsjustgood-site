// End-to-end tests of the events system against the in-memory stand-ins (no outside services).
// Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.URL = "http://localhost:8888";
delete process.env.SUPABASE_URL; delete process.env.STRIPE_SECRET_KEY; delete process.env.BREVO_API_KEY;

const { default: api } = await import("../netlify/functions/api.mjs");
const { resetMemoryStore, getStore } = await import("../netlify/lib/store.mjs");
const { getOutbox, clearOutbox } = await import("../netlify/lib/notify.mjs");
const { runReminders } = await import("../netlify/lib/services.mjs");
const { earliestDate } = await import("../netlify/lib/pricing.mjs");

const call = async (method, path, data, { admin = false, headers = {} } = {}) => {
  const res = await api(new Request("http://localhost:8888" + path, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", ...(admin ? { authorization: "Bearer dev-admin" } : {}), ...headers },
    body: data ? JSON.stringify(data) : undefined,
  }));
  const type = res.headers.get("content-type") || "";
  return { status: res.status, res, data: type.includes("json") ? await res.json() : await res.text() };
};
const future = (days, time = "10:00") => ({ date: new Date(Date.now() + days * 86400000).toISOString().slice(0, 10), start_time: time, end_time: "12:00" });

beforeEach(() => { resetMemoryStore(); clearOutbox(); });

test("admin endpoints require sign-in", async () => {
  assert.equal((await call("GET", "/api/admin/overview")).status, 401);
  assert.equal((await call("GET", "/api/admin/overview", null, { admin: true })).status, 200);
});

test("community pop-up: RSVP, capacity, waitlist, cancel promotes the waitlist", async () => {
  const { data: { event } } = await call("POST", "/api/admin/events", { title: "Blanket Drive Pop-Up", kind: "community", capacity: 3, ...future(10), venue_name: "Klyde Warren Park", address: "2012 Woodall Rodgers Fwy, Dallas, TX" }, { admin: true });
  assert.equal(event.status, "draft");
  assert.equal((await call("GET", "/api/events")).data.events.length, 0, "drafts stay hidden");
  await call("PATCH", `/api/admin/events/${event.id}`, { status: "published" }, { admin: true });
  const list = (await call("GET", "/api/events")).data.events;
  assert.equal(list.length, 1);
  assert.equal(list[0].spots_left, 3);

  const a = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Ana Diaz", email: "ana@x.com", party_size: 2 });
  assert.equal(a.data.status, "going");
  const dup = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Ana", email: "ANA@x.com" });
  assert.equal(dup.status, 409);
  const b = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Ben Lee", email: "ben@x.com", party_size: 2 });
  assert.equal(b.data.status, "waitlist", "only 1 spot left for a party of 2");
  const c = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Cy Ford", email: "cy@x.com" });
  assert.equal(c.data.status, "going");
  assert.equal((await call("GET", `/api/events/${event.slug}`)).data.event.spots_left, 0);

  const box = getOutbox();
  assert.ok(box.some((m) => m.to === "ana@x.com" && m.subject.startsWith("You're in") && m.attachments.includes("event.ics")));
  assert.ok(box.some((m) => m.to === "ben@x.com" && m.subject.includes("waitlist")));

  const cancel = await call("POST", `/api/rsvp/${a.data.token}`, { action: "cancel" });
  assert.equal(cancel.data.status, "cancelled");
  assert.equal((await call("GET", `/api/rsvp/${b.data.token}`)).data.rsvp.status, "going", "waitlisted party moved in");
  assert.ok(getOutbox().some((m) => m.to === "ben@x.com" && m.subject.startsWith("A spot opened up")));
});

test("party size changes respect capacity", async () => {
  const { data: { event } } = await call("POST", "/api/admin/events", { title: "Card Writing", capacity: 4, status: "published", ...future(5) }, { admin: true });
  const r = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Dee", email: "dee@x.com", party_size: 2 });
  await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Eli", email: "eli@x.com", party_size: 2 });
  assert.equal((await call("POST", `/api/rsvp/${r.data.token}`, { action: "party", party_size: 3 })).status, 400);
  assert.equal((await call("POST", `/api/rsvp/${r.data.token}`, { action: "party", party_size: 1 })).data.party_size, 1);
});

test("validation messages are plain and specific", async () => {
  const bad = await call("POST", "/api/bookings", { format: "host_only", duration_min: 90, group_size: 3, preferred_date: "2020-01-01" });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /company or group name/);
  assert.match(bad.data.error, /between 10 and 300/);
  assert.match(bad.data.error, /at least 21 days/);
});

test("company booking: host only, pay deposit, team RSVPs, organizer view", async () => {
  const req = { org_name: "Acme Corp", contact_name: "Pat Jones", email: "pat@acme.com", phone: "214-555-0100", format: "host_only", cause: "Childhood hunger",
    group_size: 40, duration_min: 120, preferred_date: earliestDate(new Date(Date.now() + 2 * 86400000)), start_time: "14:00", location_type: "office", address: "100 Main St, Dallas, TX" };
  const made = await call("POST", "/api/bookings", { ...req, pay_now: true });
  assert.equal(made.status, 201);
  assert.ok(made.data.checkoutUrl.includes("/api/dev/checkout-complete"));
  assert.ok(getOutbox().some((m) => m.subject.startsWith("New booking request: Acme Corp")));

  const before = await call("GET", `/api/bookings/${made.data.ref}?e=pat@acme.com`);
  assert.equal(before.data.status, "deposit_pending");
  assert.equal(before.data.total_cents, 150000);
  assert.equal(before.data.deposit_cents, 75000);
  assert.equal((await call("GET", `/api/bookings/${made.data.ref}?e=someone@else.com`)).status, 404, "email must match");

  const pay = await call("GET", new URL(made.data.checkoutUrl).pathname + new URL(made.data.checkoutUrl).search);
  assert.equal(pay.status, 302);
  const after = (await call("GET", `/api/bookings/${made.data.ref}?e=pat@acme.com`)).data;
  assert.equal(after.status, "confirmed");
  assert.equal(after.deposit_paid, true);
  assert.ok(after.balance_invoice_url, "balance invoice created");
  assert.ok(getOutbox().some((m) => m.to === "pat@acme.com" && m.subject.startsWith("Confirmed!")));

  const code = after.team_url.split("/").pop();
  const team = (await call("GET", `/api/team/${code}`)).data;
  assert.equal(team.org_name, "Acme Corp");
  assert.equal(team.organizer, undefined, "employees don't see the organizer view");
  const emp = await call("POST", `/api/team/${code}/rsvp`, { name: "Sam Smith", email: "sam@acme.com" });
  assert.equal(emp.data.status, "going");
  const k = new URL(after.organizer_url).searchParams.get("k");
  const org = (await call("GET", `/api/team/${code}?k=${k}`)).data;
  assert.equal(org.organizer.rsvps.length, 1);
  assert.equal(org.going, 1);
  assert.equal((await call("GET", "/api/events")).data.events.length, 0, "private events stay off the public calendar");
});

test("all-inclusive: quote, deposit link, confirm", async () => {
  const made = await call("POST", "/api/bookings", { org_name: "Big Bank", contact_name: "Lee", email: "lee@bank.com", format: "all_inclusive", cause: "Teachers & educators",
    group_size: 80, duration_min: 180, preferred_date: earliestDate(new Date(Date.now() + 86400000)) });
  assert.equal(made.data.checkoutUrl, null, "no instant price yet, so no deposit at request time");
  const { data: { bookings } } = await call("GET", "/api/admin/bookings", null, { admin: true });
  const q = await call("POST", `/api/admin/bookings/${bookings[0].id}/quote`, { total_cents: 640000 }, { admin: true });
  assert.equal(q.data.booking.deposit_cents, 320000);
  assert.ok(getOutbox().some((m) => m.to === "lee@bank.com" && m.subject.includes("deposit link")));
  const u = new URL(q.data.checkoutUrl);
  await call("GET", u.pathname + u.search);
  assert.equal((await call("GET", `/api/bookings/${made.data.ref}?e=lee@bank.com`)).data.status, "confirmed");
});

test("day-of: check-in, walk-ins, impact report, certificates, feedback", async () => {
  const { data: { event } } = await call("POST", "/api/admin/events", { title: "Meal Pack", status: "published", capacity: 50, ...future(1) }, { admin: true });
  const r1 = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Kim Ray", email: "kim@x.com", sms_opt_in: true, phone: "(214) 555-0199" });
  const r2 = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Lou Park", email: "lou@x.com" });

  const rem = await runReminders(new Date(new Date(event.starts_at).getTime() - 24 * 3600000));
  assert.equal(rem.emails, 2); assert.equal(rem.texts, 1);
  assert.equal((await runReminders(new Date(new Date(event.starts_at).getTime() - 23 * 3600000))).emails, 0, "never sends twice");

  const ci = await call("POST", "/api/admin/checkin", { token: `http://localhost:8888/checkin/${r1.data.token}` }, { admin: true });
  assert.ok(ci.data.rsvp.checked_in_at);
  assert.equal((await call("POST", "/api/admin/checkin", { token: "nope" }, { admin: true })).status, 404);
  await call("POST", `/api/admin/events/${event.id}/rsvps`, { name: "Walk In", party_size: 2 }, { admin: true });

  await call("PATCH", `/api/admin/events/${event.id}`, { impact: { items: [{ label: "meals packed", count: 1200 }], partner: "North Texas Food Bank", summary: "Huge day." } }, { admin: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await call("POST", `/api/admin/events/${event.id}/photos`, { filename: "group.png", content_type: "image/png", data_base64: png.toString("base64") }, { admin: true });
  assert.equal(up.data.photos.length, 1);

  clearOutbox();
  const pub = await call("POST", `/api/admin/events/${event.id}/publish-report`, { notify: true }, { admin: true });
  assert.equal(pub.data.sent, 1, "only checked-in attendees with real emails get the report");
  const tok = pub.data.report_url.split("/").pop();
  const rep = (await call("GET", `/api/report/${tok}`)).data;
  assert.equal(rep.people, 3, "Kim plus the walk-in party of 2");
  assert.equal(rep.hours, 6);
  assert.equal(rep.items[0].count, 1200);

  assert.equal((await call("GET", `/api/certificate/${r1.data.token}`)).data.hours, 2);
  assert.equal((await call("GET", `/api/certificate/${r2.data.token}`)).status, 404, "no certificate without check-in");
  assert.equal((await call("POST", `/api/report/${tok}/feedback`, { rating: 5, comment: "Loved it", can_quote: true })).status, 201);
  assert.equal((await call("GET", `/api/admin/events/${event.id}`, null, { admin: true })).data.feedback.length, 1);

  const csv = await call("GET", `/api/admin/events/${event.id}/export`, null, { admin: true });
  assert.match(csv.data, /Kim Ray/);
});

test("chip in for supplies and QR codes", async () => {
  const { data: { event } } = await call("POST", "/api/admin/events", { title: "Supply Drive", status: "published", allow_chip_in: true, ...future(4) }, { admin: true });
  const r = await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Max", email: "max@x.com" });
  const chip = await call("POST", `/api/rsvp/${r.data.token}/chip-in`, { amount_cents: 2500 });
  const u = new URL(chip.data.url);
  await call("GET", u.pathname + u.search);
  assert.equal((await call("GET", `/api/rsvp/${r.data.token}`)).data.rsvp.chip_in_cents, 2500);
  const qr = await api(new Request(`http://localhost:8888/api/qr/${r.data.token}.png`));
  assert.equal(qr.headers.get("content-type"), "image/png");
  assert.ok((await qr.arrayBuffer()).byteLength > 200);
});

test("cancelling an event notifies attendees", async () => {
  const { data: { event } } = await call("POST", "/api/admin/events", { title: "Rainy Day", status: "published", ...future(6) }, { admin: true });
  await call("POST", `/api/events/${event.slug}/rsvp`, { name: "Nia", email: "nia@x.com" });
  clearOutbox();
  await call("PATCH", `/api/admin/events/${event.id}`, { status: "cancelled", notify: true }, { admin: true });
  assert.ok(getOutbox().some((m) => m.to === "nia@x.com" && m.subject.startsWith("Canceled")));
});

test("team members and roles", async () => {
  const add = await call("POST", "/api/admin/team", { email: "helper@thatsjustgood.com", role: "staff" }, { admin: true });
  assert.equal(add.status, 201);
  assert.equal((await call("GET", "/api/admin/team", null, { admin: true })).data.team.length, 1);
  assert.equal((await call("POST", "/api/admin/team", { email: "bad", role: "staff" }, { admin: true })).status, 400);
});
