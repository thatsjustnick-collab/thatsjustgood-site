// The events system's API: public RSVPs and bookings, Stripe webhooks, and the admin dashboard.
import QRCode from "qrcode";
import { getStore, isConfigured } from "../lib/store.mjs";
import { requireAdmin } from "../lib/auth.mjs";
import { json, fail, SITE, token, isEmail } from "../lib/util.mjs";
import { eventIcs } from "../lib/ics.mjs";
import { createCheckout, readWebhook, paymentsLive } from "../lib/payments.mjs";
import { CHIP_IN_CENTS, money } from "../lib/pricing.mjs";
import * as svc from "../lib/services.mjs";
import * as mail from "../lib/emails.mjs";
import { registerHubRoutes } from "../lib/hub.mjs";

const routes = [];
const on = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, re, keys, handler });
};
const body = async (req) => { try { return await req.json(); } catch { return {}; } };

/* ---------------- Public ---------------- */
on("GET", "/api/config", async () => json({
  mode: isConfigured() ? "live" : "dev", payments: paymentsLive(),
  supabaseUrl: process.env.SUPABASE_URL || null, supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
}));

on("GET", "/api/events", async () => {
  const store = await getStore();
  const evs = await store.events.list({ kinds: ["community", "kids"], statuses: ["published"], fromIso: new Date().toISOString() });
  const out = [];
  for (const ev of evs) out.push(svc.publicEvent(ev, await store.rsvps.byEvent(ev.id)));
  return json({ events: out });
});

on("GET", "/api/events/:slug", async (req, { slug }) => {
  const store = await getStore();
  const ev = await store.events.bySlug(slug);
  if (!ev || ev.kind === "private" || !["published", "completed"].includes(ev.status)) return fail("We couldn't find that event.", 404);
  return json({ event: svc.publicEvent(ev, await store.rsvps.byEvent(ev.id)), chip_in: CHIP_IN_CENTS, payments: paymentsLive() });
});

on("GET", "/api/events/:slug/ics", async (req, { slug }) => {
  const store = await getStore();
  const ev = await store.events.bySlug(slug);
  if (!ev || ev.kind === "private") return fail("Not found", 404);
  return new Response(eventIcs(ev, { url: `${SITE()}/events/${ev.slug}` }), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${ev.slug}.ics"` },
  });
});

on("POST", "/api/events/:slug/rsvp", async (req, { slug }) => {
  const store = await getStore();
  const ev = await store.events.bySlug(slug);
  if (!ev || ev.kind === "private") return fail("We couldn't find that event.", 404);
  const r = await svc.createRsvp(ev, await body(req));
  return json({ status: r.status, token: r.token, party_size: r.party_size }, 201);
});

on("GET", "/api/rsvp/:tok", async (req, { tok }) => {
  const store = await getStore();
  const r = await store.rsvps.byToken(tok);
  if (!r) return fail("We couldn't find that RSVP.", 404);
  const ev = await store.events.get(r.event_id);
  const rsvps = await store.rsvps.byEvent(ev.id);
  let team = null;
  if (ev.booking_id) { const b = await store.bookings.get(ev.booking_id); team = b ? { org_name: b.org_name, code: b.portal_code } : null; }
  return json({
    rsvp: { name: r.name, email: r.email, party_size: r.party_size, status: r.status, checked_in: Boolean(r.checked_in_at), chip_in_cents: r.chip_in_cents },
    event: svc.publicEvent(ev, rsvps), team, chip_in: ev.allow_chip_in ? CHIP_IN_CENTS : [],
  });
});

on("POST", "/api/rsvp/:tok", async (req, { tok }) => {
  const { rsvp } = await svc.changeRsvp(tok, await body(req));
  return json({ status: rsvp.status, party_size: rsvp.party_size });
});

on("POST", "/api/rsvp/:tok/chip-in", async (req, { tok }) => {
  const store = await getStore();
  const r = await store.rsvps.byToken(tok);
  if (!r) return fail("We couldn't find that RSVP.", 404);
  const ev = await store.events.get(r.event_id);
  if (!ev.allow_chip_in) return fail("This event isn't collecting supply contributions.");
  const { amount_cents } = await body(req);
  const amt = Math.round(Number(amount_cents));
  if (!amt || amt < 500 || amt > 100000) return fail("Choose an amount between $5 and $1,000.");
  const c = await createCheckout({
    kind: "chip_in", amountCents: amt, email: r.email, name: `Supplies for ${ev.title}`,
    description: "Your contribution covers supplies for this That's Just Good pop-up.",
    metadata: { rsvp_id: r.id }, successPath: `/rsvp/${r.token}`, cancelPath: `/rsvp/${r.token}`,
  });
  return json({ url: c.url });
});

on("GET", "/api/qr/:file", async (req, { file }) => {
  const tok = file.replace(/\.png$/, "");
  const png = await QRCode.toBuffer(`${SITE()}/checkin/${tok}`, { width: 320, margin: 1, color: { dark: "#13294B", light: "#FFFFFF" } });
  return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
});

on("POST", "/api/bookings", async (req) => {
  const b = await body(req);
  const { booking, checkoutUrl } = await svc.createBooking(b, { payNow: Boolean(b.pay_now) });
  return json({ ref: booking.ref, email: booking.email, checkoutUrl: checkoutUrl || null }, 201);
});

const bookingForClient = async (ref, email) => {
  const store = await getStore();
  const b = await store.bookings.byRef(String(ref || "").toUpperCase());
  if (!b || !email || b.email !== String(email).toLowerCase()) throw Object.assign(new Error("We couldn't find that booking."), { status: 404 });
  return b;
};

on("GET", "/api/bookings/:ref", async (req, { ref }) => {
  const b = await bookingForClient(ref, new URL(req.url).searchParams.get("e"));
  const out = {
    ref: b.ref, org_name: b.org_name, contact_name: b.contact_name, status: b.status, format: b.format, cause: b.cause,
    group_size: b.group_size, duration_min: b.duration_min, preferred_date: b.preferred_date, total_cents: b.total_cents,
    deposit_cents: b.deposit_cents, deposit_paid: Boolean(b.deposit_paid_at), balance_invoice_url: b.balance_invoice_url,
  };
  if (b.status === "confirmed" || b.status === "completed") {
    out.team_url = `${SITE()}/team/${b.portal_code}`;
    out.organizer_url = `${SITE()}/team/${b.portal_code}?k=${b.organizer_token}`;
  }
  return json(out);
});

on("POST", "/api/bookings/:ref/deposit", async (req, { ref }) => {
  const b = await bookingForClient(ref, new URL(req.url).searchParams.get("e"));
  if (!["quoted", "deposit_pending"].includes(b.status) || !b.deposit_cents) return fail("This booking isn't waiting on a deposit.");
  return json({ url: await svc.startDeposit(b) });
});

on("GET", "/api/team/:code", async (req, { code }) => {
  const { out } = await svc.teamPortal(code, new URL(req.url).searchParams.get("k"));
  return json(out);
});

on("POST", "/api/team/:code/rsvp", async (req, { code }) => {
  const { ev } = await svc.teamPortal(code);
  const r = await svc.createRsvp(ev, { ...(await body(req)), email_opt_in: false });
  return json({ status: r.status, token: r.token }, 201);
});

on("GET", "/api/report/:tok", async (req, { tok }) => json(await svc.publicReport(tok)));

on("POST", "/api/report/:tok/feedback", async (req, { tok }) => {
  const store = await getStore();
  const ev = await store.events.byReportToken(tok);
  if (!ev) return fail("This report isn't available.", 404);
  const f = await body(req);
  const rating = Number(f.rating);
  if (!(rating >= 1 && rating <= 5)) return fail("Pick a rating from 1 to 5.");
  await store.feedback.insert({ event_id: ev.id, name: String(f.name || "").slice(0, 120) || null, rating, comment: String(f.comment || "").slice(0, 3000) || null, can_quote: Boolean(f.can_quote) });
  return json({ ok: true }, 201);
});

on("GET", "/api/certificate/:tok", async (req, { tok }) => json(await svc.certificate(tok)));

/* ---------------- Payments ---------------- */
async function handlePaid(kind, meta, sessionId, amount) {
  const store = await getStore();
  if (kind === "deposit" && meta.booking_id) await svc.confirmBooking(meta.booking_id, { depositPaid: true, sessionId });
  if (kind === "chip_in" && meta.rsvp_id) {
    const r = await store.rsvps.get(meta.rsvp_id);
    if (r) await store.rsvps.update(r.id, { chip_in_cents: (r.chip_in_cents || 0) + Number(amount || 0) });
  }
}

on("POST", "/api/stripe/webhook", async (req) => {
  let evt;
  try { evt = await readWebhook(req); } catch (e) { return fail("Invalid signature", 400); }
  const o = evt.data.object;
  if (evt.type === "checkout.session.completed" && o.payment_status === "paid") await handlePaid(o.metadata?.kind, o.metadata || {}, o.id, o.amount_total);
  if (evt.type === "invoice.paid" && o.metadata?.kind === "balance") {
    const store = await getStore();
    if (o.metadata.booking_id) await store.bookings.update(o.metadata.booking_id, { balance_paid_at: new Date().toISOString() });
  }
  return json({ received: true });
});

// Local development only: simulates a completed Stripe payment.
on("GET", "/api/dev/checkout-complete", async (req) => {
  if (paymentsLive() || isConfigured()) return fail("Not available", 404);
  const q = Object.fromEntries(new URL(req.url).searchParams);
  await handlePaid(q.kind, q, q.session, q.amount);
  const next = q.next || "/";
  return Response.redirect(`${SITE()}${next}${next.includes("?") ? "&" : "?"}paid=1`, 302);
});

/* ---------------- Admin ---------------- */
const admin = (method, pattern, action, handler) => on(method, pattern, async (req, params) => {
  const ctx = await requireAdmin(req, action);
  return handler(req, params, ctx);
});

admin("GET", "/api/admin/me", "view", async (req, p, { member }) => json({ member }));

async function eventRow(store, ev) {
  const rsvps = await store.rsvps.byEvent(ev.id);
  const going = rsvps.filter((r) => r.status === "going");
  return { ...ev, counts: { going: svc.spotsTaken(rsvps), rsvps: going.length, waitlist: rsvps.filter((r) => r.status === "waitlist").length, checked_in: going.filter((r) => r.checked_in_at).length } };
}

admin("GET", "/api/admin/overview", "view", async () => {
  const store = await getStore();
  const nowIso = new Date().toISOString();
  const evs = await store.events.list({});
  const upcoming = [];
  for (const ev of evs.filter((e) => e.ends_at >= nowIso && e.status !== "cancelled").slice(0, 8)) upcoming.push(await eventRow(store, ev));
  const bookings = await store.bookings.list();
  const needsReport = evs.filter((e) => e.ends_at < nowIso && e.status === "published").length;
  return json({
    upcoming,
    bookings_to_act: bookings.filter((b) => ["requested", "quoted", "deposit_pending"].includes(b.status)),
    stats: { upcoming_events: evs.filter((e) => e.ends_at >= nowIso && e.status === "published").length, open_requests: bookings.filter((b) => b.status === "requested").length, needs_report: needsReport },
  });
});

admin("GET", "/api/admin/events", "view", async () => {
  const store = await getStore();
  const out = [];
  for (const ev of await store.events.list({})) out.push(await eventRow(store, ev));
  return json({ events: out });
});

admin("POST", "/api/admin/events", "manage", async (req) => json({ event: await svc.saveEvent(await body(req)) }, 201));

admin("GET", "/api/admin/events/:id", "view", async (req, { id }) => {
  const store = await getStore();
  const ev = await store.events.get(id);
  if (!ev) return fail("Event not found.", 404);
  const booking = ev.booking_id ? await store.bookings.get(ev.booking_id) : null;
  return json({ event: await eventRow(store, ev), rsvps: await store.rsvps.byEvent(id), feedback: await store.feedback.byEvent(id), summary: await svc.impactSummary(ev), booking });
});

admin("PATCH", "/api/admin/events/:id", "impact", async (req, { id }, { member }) => {
  const store = await getStore();
  const before = await store.events.get(id);
  if (!before) return fail("Event not found.", 404);
  const patch = await body(req);
  const onlyImpact = Object.keys(patch).every((k) => k === "impact");
  if (!onlyImpact && !["owner", "admin"].includes(member.role)) return fail("Your role can only update impact numbers.", 403);
  if (patch.impact) patch.impact = { ...(before.impact || {}), ...patch.impact };
  const notify = patch.notify; delete patch.notify;
  const ev = await svc.saveEvent(patch, id);
  if (before.status !== "cancelled" && ev.status === "cancelled" && notify) {
    for (const r of (await store.rsvps.byEvent(id)).filter((x) => x.status !== "cancelled")) await mail.eventCancelled(ev, r);
  }
  return json({ event: ev });
});

admin("DELETE", "/api/admin/events/:id", "manage", async (req, { id }) => {
  const store = await getStore();
  const ev = await store.events.get(id);
  if (!ev) return fail("Event not found.", 404);
  if ((await store.rsvps.byEvent(id)).length) return fail("This event has RSVPs. Cancel it instead of deleting it.");
  await store.events.remove(id);
  return json({ ok: true });
});

admin("GET", "/api/admin/events/:id/export", "view", async (req, { id }) => {
  const store = await getStore();
  const ev = await store.events.get(id);
  const rows = [["Name", "Email", "Phone", "Party size", "Status", "Checked in", "Supplies chip-in", "RSVP'd"]];
  for (const r of await store.rsvps.byEvent(id)) rows.push([r.name, r.email, r.phone || "", r.party_size, r.status, r.checked_in_at ? "Yes" : "", r.chip_in_cents ? money(r.chip_in_cents) : "", r.created_at]);
  const csv = rows.map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${ev?.slug || "rsvps"}.csv"` } });
});

admin("POST", "/api/admin/events/:id/rsvps", "checkin", async (req, { id }) => {
  // Walk-ins added at the door: saved and checked in, with a confirmation email if they gave one
  const store = await getStore();
  const ev = await store.events.get(id);
  const f = await body(req);
  const email = String(f.email || "").trim().toLowerCase();
  if (!f.name) return fail("Add their name.");
  const r = await store.rsvps.insert({
    event_id: id, name: String(f.name).trim(), email: isEmail(email) ? email : `walkin-${token(6)}@walkin.local`,
    party_size: Math.max(1, Number(f.party_size) || 1), status: "going", token: token(), checked_in_at: new Date().toISOString(), email_opt_in: Boolean(f.email_opt_in && isEmail(email)),
  });
  return json({ rsvp: r }, 201);
});

admin("POST", "/api/admin/checkin", "checkin", async (req) => {
  const { token: tok, undo } = await body(req);
  const t = String(tok || "").split("/").pop();
  const r = await svc.checkIn(t, Boolean(undo));
  return json({ rsvp: r });
});

admin("POST", "/api/admin/events/:id/photos", "impact", async (req, { id }) => {
  const store = await getStore();
  const ev = await store.events.get(id);
  if (!ev) return fail("Event not found.", 404);
  const { filename, content_type, data_base64 } = await body(req);
  if (!/^image\/(jpeg|png|webp)$/.test(content_type || "")) return fail("Upload a JPG, PNG or WebP photo.");
  const bytes = Buffer.from(String(data_base64 || ""), "base64");
  if (bytes.length > 4.5 * 1024 * 1024) return fail("That photo is too large. Try one under 4 MB.");
  const ext = content_type.split("/")[1].replace("jpeg", "jpg");
  const url = await store.photos.upload(`${ev.id}/${Date.now()}-${(filename || "photo").replace(/[^a-z0-9.-]/gi, "").slice(0, 40) || "photo"}.${ext}`.replace(/\.(jpg|png|webp)\.(jpg|png|webp)$/, ".$2"), bytes, content_type);
  const impact = { ...(ev.impact || {}), photos: [...(ev.impact?.photos || []), url] };
  await store.events.update(id, { impact });
  return json({ url, photos: impact.photos }, 201);
});

admin("POST", "/api/admin/events/:id/publish-report", "manage", async (req, { id }) => {
  const { notify = true } = await body(req);
  const { event, sent } = await svc.publishReport(id, { notify });
  return json({ report_url: `${SITE()}/report/${event.report_token}`, sent });
});

admin("GET", "/api/admin/bookings", "view", async () => json({ bookings: await (await getStore()).bookings.list() }));

admin("GET", "/api/admin/bookings/:id", "view", async (req, { id }) => {
  const b = await (await getStore()).bookings.get(id);
  return b ? json({ booking: b, team_url: b.portal_code ? `${SITE()}/team/${b.portal_code}` : null, organizer_url: b.portal_code ? `${SITE()}/team/${b.portal_code}?k=${b.organizer_token}` : null }) : fail("Booking not found.", 404);
});

admin("PATCH", "/api/admin/bookings/:id", "manage", async (req, { id }) => {
  const allowed = ["admin_notes", "status", "preferred_date", "start_time", "address", "group_size", "notes"];
  const f = await body(req);
  const patch = Object.fromEntries(Object.entries(f).filter(([k]) => allowed.includes(k)));
  return json({ booking: await (await getStore()).bookings.update(id, patch) });
});

admin("POST", "/api/admin/bookings/:id/quote", "manage", async (req, { id }) => {
  const { total_cents } = await body(req);
  return json(await svc.quoteBooking(id, total_cents));
});

admin("POST", "/api/admin/bookings/:id/confirm", "manage", async (req, { id }) => {
  const { deposit_paid = false } = await body(req);
  return json({ booking: await svc.confirmBooking(id, { depositPaid: deposit_paid }) });
});

admin("POST", "/api/admin/bookings/:id/resend-deposit", "manage", async (req, { id }) => {
  const store = await getStore();
  const b = await store.bookings.get(id);
  if (!b?.deposit_cents) return fail("Set a price first.");
  const url = await svc.startDeposit(b);
  await mail.depositRequest(await store.bookings.get(id), url);
  return json({ url });
});

admin("GET", "/api/admin/team", "view", async () => json({ team: await (await getStore()).team.list() }));

admin("POST", "/api/admin/team", "team", async (req) => {
  const store = await getStore();
  const { email, role = "staff", name } = await body(req);
  const em = String(email || "").trim().toLowerCase();
  if (!isEmail(em)) return fail("Add a valid email address.");
  if (!["owner", "admin", "staff"].includes(role)) return fail("Choose a role.");
  let userId = "dev-" + token(4);
  if (isConfigured()) {
    const { data, error } = await store.client.auth.admin.inviteUserByEmail(em, { redirectTo: `${SITE()}/admin` });
    if (error) {
      const { data: list } = await store.client.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === em);
      if (!existing) return fail("We couldn't invite that email. Try again.");
      userId = existing.id;
      await mail.teamInvite(em, role);
    } else userId = data.user.id;
  } else await mail.teamInvite(em, role);
  return json({ member: await store.team.upsert({ user_id: userId, email: em, name: name || null, role }) }, 201);
});

admin("DELETE", "/api/admin/team/:uid", "team", async (req, { uid }, { member }) => {
  if (uid === member.user_id) return fail("You can't remove yourself.");
  await (await getStore()).team.remove(uid);
  return json({ ok: true });
});

admin("POST", "/api/admin/run-reminders", "manage", async () => json(await svc.runReminders()));

registerHubRoutes(on, admin);

/* ---------------- Router ---------------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      return await r.handler(req, params);
    } catch (e) {
      if (!e.status) console.error(e);
      return fail(e.status ? e.message : "Something went wrong on our end. Please try again, or email dogood@thatsjustgood.com.", e.status || 500);
    }
  }
  return fail("Not found", 404);
};

export const config = { path: ["/api/*"], excludedPath: ["/api/episodes"] };
