// The events system's core rules: RSVPs and waitlists, bookings and payments, check-in and impact.
import { getStore } from "./store.mjs";
import { token, code, slugify, centralToIso, isEmail, cleanPhone, hoursFor, SITE } from "./util.mjs";
import { estimate, validateBooking, RULES } from "./pricing.mjs";
import { createCheckout, sendBalanceInvoice } from "./payments.mjs";
import { addToList, sendSms } from "./notify.mjs";
import * as mail from "./emails.mjs";

const err = (message, status = 400) => Object.assign(new Error(message), { status });

/* ---------------- Events ---------------- */
export function spotsTaken(rsvps) {
  return rsvps.filter((r) => r.status === "going").reduce((n, r) => n + (r.party_size || 1), 0);
}

/** What the public site may see about an event. */
export function publicEvent(ev, rsvps = []) {
  const taken = spotsTaken(rsvps);
  return {
    slug: ev.slug, kind: ev.kind, title: ev.title, cause: ev.cause, summary: ev.summary, description: ev.description,
    starts_at: ev.starts_at, ends_at: ev.ends_at, venue_name: ev.venue_name, address: ev.address,
    parking: ev.parking, what_to_bring: ev.what_to_bring, cover_url: ev.cover_url, status: ev.status,
    allow_chip_in: ev.allow_chip_in, capacity: ev.capacity ?? null,
    spots_left: ev.capacity == null ? null : Math.max(0, ev.capacity - taken),
    waitlist: ev.waitlist, going: taken,
  };
}

export async function uniqueSlug(title, date) {
  const store = await getStore();
  const base = slugify(`${title} ${(date || "").slice(0, 10)}`);
  let slug = base, n = 2;
  while (await store.events.bySlug(slug)) slug = `${base}-${n++}`;
  return slug;
}

export async function saveEvent(input, id) {
  const store = await getStore();
  const f = { ...input };
  if (f.date) {
    f.starts_at = centralToIso(f.date, f.start_time || "10:00");
    f.ends_at = centralToIso(f.date, f.end_time || "12:00");
    if (f.ends_at <= f.starts_at) throw err("The end time needs to be after the start time.");
  }
  delete f.date; delete f.start_time; delete f.end_time;
  if ("capacity" in f) f.capacity = f.capacity === "" || f.capacity == null ? null : Math.max(1, Number(f.capacity));
  if (!id) {
    if (!f.title) throw err("Give the event a title.");
    if (!f.starts_at) throw err("Choose a date and time.");
    f.slug = await uniqueSlug(f.title, f.starts_at);
    return store.events.insert({ status: "draft", kind: "community", impact: {}, ...f });
  }
  return store.events.update(id, f);
}

/* ---------------- RSVPs ---------------- */
export async function createRsvp(ev, input) {
  const store = await getStore();
  if (!ev || ev.status !== "published") throw err("This event isn't open for RSVPs.", 404);
  if (new Date(ev.ends_at) < new Date()) throw err("This event already happened.");
  const name = String(input.name || "").trim(), email = String(input.email || "").trim().toLowerCase();
  if (!name) throw err("Add your name.");
  if (!isEmail(email)) throw err("Add a valid email address.");
  const party = Math.min(20, Math.max(1, Number(input.party_size) || 1));
  const rsvps = await store.rsvps.byEvent(ev.id);
  const left = ev.capacity == null ? Infinity : ev.capacity - spotsTaken(rsvps);
  let status = "going";
  if (party > left) {
    if (!ev.waitlist) throw err(left > 0 ? `Only ${left} spot${left === 1 ? "" : "s"} left. Try a smaller group.` : "This event is full.");
    status = "waitlist";
  }
  let r;
  try {
    r = await store.rsvps.insert({
      event_id: ev.id, name, email, phone: cleanPhone(input.phone) || null, sms_opt_in: Boolean(input.sms_opt_in && input.phone),
      party_size: party, status, token: token(), email_opt_in: input.email_opt_in !== false,
    });
  } catch (e) {
    if (e.code === "23505") throw err("You've already RSVP'd with this email. Check your inbox for the link to change it.", 409);
    throw e;
  }
  if (status === "going") await mail.rsvpConfirmed(ev, r); else await mail.rsvpWaitlisted(ev, r);
  if (r.email_opt_in && ev.kind !== "private") await addToList({ email, name });
  return r;
}

export async function promoteWaitlist(ev) {
  const store = await getStore();
  if (ev.capacity == null) return [];
  const rsvps = await store.rsvps.byEvent(ev.id);
  let left = ev.capacity - spotsTaken(rsvps);
  const promoted = [];
  for (const r of rsvps.filter((x) => x.status === "waitlist")) {
    if (r.party_size <= left) {
      const u = await store.rsvps.update(r.id, { status: "going" });
      left -= r.party_size;
      promoted.push(u);
      await mail.rsvpPromoted(ev, u);
    }
  }
  return promoted;
}

export async function changeRsvp(tok, { action, party_size }) {
  const store = await getStore();
  const r = await store.rsvps.byToken(tok);
  if (!r) throw err("We couldn't find that RSVP.", 404);
  const ev = await store.events.get(r.event_id);
  if (action === "cancel") {
    const u = await store.rsvps.update(r.id, { status: "cancelled" });
    await promoteWaitlist(ev);
    return { rsvp: u, event: ev };
  }
  if (action === "party" && party_size) {
    const n = Math.min(20, Math.max(1, Number(party_size)));
    if (r.status === "going" && ev.capacity != null && n > r.party_size) {
      const others = spotsTaken((await store.rsvps.byEvent(ev.id)).filter((x) => x.id !== r.id));
      if (others + n > ev.capacity) throw err(`Only ${ev.capacity - others} spot(s) are available for your group.`);
    }
    const u = await store.rsvps.update(r.id, { party_size: n });
    if (n < r.party_size) await promoteWaitlist(ev);
    return { rsvp: u, event: ev };
  }
  throw err("Unknown change.");
}

export async function checkIn(tok, undo = false) {
  const store = await getStore();
  const r = await store.rsvps.byToken(tok);
  if (!r) throw err("No RSVP matches that code.", 404);
  if (r.status === "cancelled") throw err(`${r.name} cancelled this RSVP.`);
  const u = await store.rsvps.update(r.id, { checked_in_at: undo ? null : new Date().toISOString(), ...(r.status === "waitlist" && !undo ? { status: "going" } : {}) });
  return u;
}

/* ---------------- Bookings ---------------- */
export async function createBooking(input, { payNow = false } = {}) {
  const store = await getStore();
  const b = {
    org_name: String(input.org_name || "").trim(), contact_name: String(input.contact_name || "").trim(),
    email: String(input.email || "").trim().toLowerCase(), phone: cleanPhone(input.phone) || null,
    format: input.format, cause: input.cause, group_size: Number(input.group_size), duration_min: Number(input.duration_min),
    preferred_date: input.preferred_date, alt_date: input.alt_date || null, start_time: input.start_time || null,
    location_type: input.location_type || null, address: input.address || null, notes: input.notes || null,
  };
  const problems = validateBooking(b);
  if (problems.length) throw err(problems.join(" "));
  const est = estimate({ format: b.format, minutes: b.duration_min, groupSize: b.group_size });
  const row = await store.bookings.insert({
    ...b, ref: "TJG-" + code(5), status: "requested",
    estimate_cents: est.quote ? null : est.total, total_cents: est.quote ? null : est.total, deposit_cents: est.quote ? null : est.deposit,
  });
  await mail.bookingReceived(row, est);
  if (payNow && !est.quote) {
    const url = await startDeposit(row);
    return { booking: await store.bookings.get(row.id), checkoutUrl: url };
  }
  return { booking: row };
}

export async function startDeposit(b) {
  const store = await getStore();
  const c = await createCheckout({
    kind: "deposit", amountCents: b.deposit_cents, email: b.email,
    name: `Deposit: That's Just Good team building (${b.ref})`,
    description: `${b.org_name}, ${b.group_size} people, ${b.preferred_date}`,
    metadata: { booking_id: b.id, booking_ref: b.ref },
    successPath: `/booking?ref=${b.ref}&e=${encodeURIComponent(b.email)}`, cancelPath: `/booking?ref=${b.ref}&e=${encodeURIComponent(b.email)}`,
  });
  await store.bookings.update(b.id, { stripe_checkout_id: c.id, status: "deposit_pending" });
  return c.url;
}

export async function quoteBooking(id, totalCents) {
  const store = await getStore();
  const b = await store.bookings.get(id);
  if (!b) throw err("Booking not found.", 404);
  const total = Math.round(Number(totalCents));
  if (!total || total < 100) throw err("Enter the total price.");
  const deposit = Math.round((total * RULES.depositPercent) / 100);
  const updated = await store.bookings.update(id, { total_cents: total, deposit_cents: deposit, status: "quoted" });
  const url = await startDeposit(updated);
  await mail.depositRequest(updated, url);
  return { booking: await store.bookings.get(id), checkoutUrl: url };
}

/** Lock in the date: create the private event, the team RSVP link, and the balance invoice. */
export async function confirmBooking(id, { depositPaid = false, sessionId } = {}) {
  const store = await getStore();
  let b = await store.bookings.get(id);
  if (!b) throw err("Booking not found.", 404);
  if (b.status === "confirmed" || b.status === "completed") return b;
  const start = centralToIso(b.preferred_date, b.start_time || "10:00");
  const end = new Date(new Date(start).getTime() + (b.duration_min || 120) * 60000).toISOString();
  const ev = await store.events.insert({
    slug: await uniqueSlug(`${b.org_name} impact event`, start), kind: "private", status: "published",
    title: `${b.org_name} Impact Event`, cause: b.cause,
    summary: `A That's Just Good team building event supporting ${b.cause ? b.cause.toLowerCase() : "a great cause"}.`,
    starts_at: start, ends_at: end, address: b.address, capacity: null, waitlist: false, booking_id: b.id, impact: {},
  });
  const patch = {
    status: "confirmed", event_id: ev.id, portal_code: code(6), organizer_token: token(),
    ...(depositPaid ? { deposit_paid_at: new Date().toISOString() } : {}), ...(sessionId ? { stripe_checkout_id: sessionId } : {}),
  };
  b = await store.bookings.update(id, patch);
  const balance = (b.total_cents || 0) - (depositPaid ? b.deposit_cents || 0 : 0);
  if (balance > 0) {
    const due = new Date(new Date(start).getTime() - RULES.balanceDueDaysBefore * 86400000).toISOString().slice(0, 10);
    try {
      const inv = await sendBalanceInvoice({ booking: b, amountCents: balance, dueDate: due });
      b = await store.bookings.update(id, { balance_invoice_id: inv.id, balance_invoice_url: inv.url, stripe_customer_id: inv.customerId });
    } catch (e) { console.error("Balance invoice failed", e); }
  }
  await mail.bookingConfirmed(b, ev);
  return b;
}

/** Organizer and employee views of a company event. */
export async function teamPortal(codeStr, organizerKey) {
  const store = await getStore();
  const b = await store.bookings.byPortal(String(codeStr || "").toUpperCase());
  if (!b || !b.event_id) throw err("This team link isn't valid. Check with your organizer.", 404);
  const ev = await store.events.get(b.event_id);
  const rsvps = (await store.rsvps.byEvent(ev.id)).filter((r) => r.status !== "cancelled");
  const out = { event: publicEvent(ev, rsvps), org_name: b.org_name, group_size: b.group_size, going: spotsTaken(rsvps) };
  if (organizerKey && organizerKey === b.organizer_token) {
    out.organizer = {
      contact_name: b.contact_name, ref: b.ref, status: b.status,
      balance_invoice_url: b.balance_invoice_url, balance_paid: Boolean(b.balance_paid_at),
      rsvps: rsvps.map((r) => ({ name: r.name, email: r.email, party_size: r.party_size, checked_in: Boolean(r.checked_in_at), at: r.created_at })),
      report_url: ev.report_token && ev.report_published_at ? `${SITE()}/report/${ev.report_token}` : null,
    };
  }
  return { out, ev, booking: b };
}

/* ---------------- Impact ---------------- */
export async function impactSummary(ev) {
  const store = await getStore();
  const rsvps = (await store.rsvps.byEvent(ev.id)).filter((r) => r.status === "going");
  const checked = rsvps.filter((r) => r.checked_in_at);
  const people = (checked.length ? checked : rsvps).reduce((n, r) => n + (r.party_size || 1), 0);
  const hours = Math.round(people * hoursFor(ev) * 10) / 10;
  return { people, hours, checked_in: checked.length };
}

export async function publishReport(id, { notify = true } = {}) {
  const store = await getStore();
  let ev = await store.events.get(id);
  if (!ev) throw err("Event not found.", 404);
  ev = await store.events.update(id, { report_token: ev.report_token || token(12), report_published_at: new Date().toISOString(), status: "completed" });
  let sent = 0;
  if (notify) {
    const rsvps = (await store.rsvps.byEvent(id)).filter((r) => r.status === "going");
    const anyChecked = rsvps.some((r) => r.checked_in_at);
    for (const r of rsvps.filter((x) => (!anyChecked || x.checked_in_at) && !x.email.endsWith("@walkin.local"))) { await mail.reportReady(ev, r); sent++; }
    if (ev.booking_id) {
      const b = await store.bookings.get(ev.booking_id);
      if (b && !rsvps.some((r) => r.email === b.email)) { await mail.reportReady(ev, null, { org: b }); sent++; }
      if (b) await store.bookings.update(b.id, { status: "completed" });
    }
  }
  return { event: ev, sent };
}

export async function publicReport(tok) {
  const store = await getStore();
  const ev = await store.events.byReportToken(tok);
  if (!ev || !ev.report_published_at) throw err("This report isn't available.", 404);
  const s = await impactSummary(ev);
  let org = null;
  if (ev.booking_id) org = (await store.bookings.get(ev.booking_id))?.org_name || null;
  return {
    title: ev.title, kind: ev.kind, cause: ev.cause, starts_at: ev.starts_at, ends_at: ev.ends_at, venue_name: ev.venue_name, org,
    people: s.people, hours: s.hours, items: ev.impact?.items || [], partner: ev.impact?.partner || null,
    summary: ev.impact?.summary || null, photos: ev.impact?.photos || [],
  };
}

export async function certificate(tok) {
  const store = await getStore();
  const r = await store.rsvps.byToken(tok);
  if (!r || !r.checked_in_at) throw err("A certificate is available after you check in at the event.", 404);
  const ev = await store.events.get(r.event_id);
  let org = null;
  if (ev.booking_id) org = (await store.bookings.get(ev.booking_id))?.org_name || null;
  return { name: r.name, title: ev.title, cause: ev.cause, starts_at: ev.starts_at, hours: hoursFor(ev), venue_name: ev.venue_name, org, partner: ev.impact?.partner || null, id: r.id.slice(0, 8).toUpperCase() };
}

/* ---------------- Scheduled: reminders ---------------- */
export async function runReminders(now = new Date()) {
  const store = await getStore();
  const from = new Date(now.getTime() + 20 * 3600000).toISOString(), to = new Date(now.getTime() + 28 * 3600000).toISOString();
  const events = (await store.events.list({ statuses: ["published"] })).filter((e) => e.starts_at >= from && e.starts_at <= to);
  let emails = 0, texts = 0, digests = 0;
  for (const ev of events) {
    const rsvps = await store.rsvps.byEvent(ev.id);
    for (const r of rsvps.filter((x) => x.status === "going" && !x.reminder_sent_at)) {
      await mail.rsvpReminder(ev, r); emails++;
      if (r.sms_opt_in && r.phone) {
        await sendSms({ to: r.phone, text: `That's Just Good: see you tomorrow at ${ev.title}! Details: ${SITE()}/rsvp/${r.token} Reply STOP to opt out.` });
        texts++;
      }
      await store.rsvps.update(r.id, { reminder_sent_at: new Date().toISOString() });
    }
    if (ev.booking_id && !ev.impact?.digest_sent) {
      const b = await store.bookings.get(ev.booking_id);
      if (b) { await mail.organizerDigest(b, ev, spotsTaken(rsvps)); digests++; }
      await store.events.update(ev.id, { impact: { ...(ev.impact || {}), digest_sent: true } });
    }
  }
  return { events: events.length, emails, texts, digests };
}
