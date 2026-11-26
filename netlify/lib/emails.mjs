// Every email the events system sends, in one place so the wording is easy to update.
import { layout, detailRows, sendEmail, NOTIFY_EMAIL } from "./notify.mjs";
import { eventIcs } from "./ics.mjs";
import { SITE, esc, fmtWhen, fmtDate } from "./util.mjs";
import { money, RULES } from "./pricing.mjs";

const eventUrl = (ev) => (ev.kind === "private" ? null : `${SITE()}/events/${ev.slug}`);
const where = (ev) => esc([ev.venue_name, ev.address].filter(Boolean).join(", "));
const mapLink = (ev) => ev.address ? ` <a href="https://maps.google.com/?q=${encodeURIComponent(ev.address)}" style="color:#13294B">Map</a>` : "";
const manageUrl = (r) => `${SITE()}/rsvp/${r.token}`;
const qr = (r) => `<p style="margin:18px 0 6px;font-size:14px;color:#4B5E72">Show this code at check-in:</p>
<img src="${SITE()}/api/qr/${r.token}.png" width="160" height="160" alt="Check-in code" style="display:block;border:0">`;
const ics = (ev) => ({ name: "event.ics", content: eventIcs(ev, { url: eventUrl(ev) || SITE() }) });

export function rsvpConfirmed(ev, r) {
  const party = r.party_size > 1 ? ` for you and ${r.party_size - 1} guest${r.party_size > 2 ? "s" : ""}` : "";
  return sendEmail({
    to: r.email, toName: r.name, subject: `You're in: ${ev.title}`,
    attachments: [ics(ev)],
    html: layout({
      preheader: `See you ${fmtDate(ev.starts_at, { weekday: undefined, year: undefined })}.`,
      heading: `You're in, ${esc(r.name.split(" ")[0])}!`,
      body: `<p>Your spot${party} is saved for <b>${esc(ev.title)}</b>. The calendar invite is attached.</p>
      ${detailRows([["When", esc(fmtWhen(ev.starts_at, ev.ends_at))], ["Where", where(ev) + mapLink(ev)], ["Parking", esc(ev.parking)], ["Bring", esc(ev.what_to_bring)]])}
      ${qr(r)}`,
      cta: "View or change my RSVP", ctaUrl: manageUrl(r),
      footerNote: "Plans changed? Use the button above to cancel so someone on the waitlist can take your spot.",
    }),
  });
}

export function rsvpWaitlisted(ev, r) {
  return sendEmail({
    to: r.email, toName: r.name, subject: `You're on the waitlist: ${ev.title}`,
    html: layout({
      heading: "You're on the waitlist",
      body: `<p><b>${esc(ev.title)}</b> is full right now. If a spot opens up, we'll move you in automatically and email you right away.</p>
      ${detailRows([["When", esc(fmtWhen(ev.starts_at, ev.ends_at))], ["Where", where(ev)]])}`,
      cta: "View my RSVP", ctaUrl: manageUrl(r),
    }),
  });
}

export function rsvpPromoted(ev, r) {
  return sendEmail({
    to: r.email, toName: r.name, subject: `A spot opened up: ${ev.title}`, attachments: [ics(ev)],
    html: layout({
      heading: "Good news, a spot opened up!",
      body: `<p>You're now confirmed for <b>${esc(ev.title)}</b>. The calendar invite is attached.</p>
      ${detailRows([["When", esc(fmtWhen(ev.starts_at, ev.ends_at))], ["Where", where(ev) + mapLink(ev)], ["Parking", esc(ev.parking)]])}${qr(r)}`,
      cta: "View or change my RSVP", ctaUrl: manageUrl(r),
    }),
  });
}

export function rsvpReminder(ev, r) {
  return sendEmail({
    to: r.email, toName: r.name, subject: `Tomorrow: ${ev.title}`,
    html: layout({
      preheader: "Here's everything you need for tomorrow.",
      heading: "See you tomorrow!",
      body: `<p>Quick reminder about <b>${esc(ev.title)}</b>.</p>
      ${detailRows([["When", esc(fmtWhen(ev.starts_at, ev.ends_at))], ["Where", where(ev) + mapLink(ev)], ["Parking", esc(ev.parking)], ["Bring", esc(ev.what_to_bring)]])}${qr(r)}`,
      cta: "Can't make it? Let us know", ctaUrl: manageUrl(r),
    }),
  });
}

export function bookingReceived(b, est) {
  const rows = [["Reference", esc(b.ref)], ["Format", b.format === "host_only" ? "Host Only" : "All-Inclusive"], ["Cause", esc(b.cause)],
    ["Group size", String(b.group_size)], ["Length", `${b.duration_min} minutes`], ["Date", esc(fmtDate(b.preferred_date + "T17:00:00Z")) + (b.alt_date ? ` (backup: ${esc(fmtDate(b.alt_date + "T17:00:00Z"))})` : "")],
    ["Location", esc(b.address || b.location_type)], ["Estimate", est && !est.quote ? money(est.total) : "Custom quote coming within 1 business day"]];
  return Promise.all([
    sendEmail({
      to: b.email, toName: b.contact_name, subject: `We got your event request (${b.ref})`,
      html: layout({
        heading: `Thanks, ${esc(b.contact_name.split(" ")[0])}! We're on it.`,
        body: `<p>We received your team building request for <b>${esc(b.org_name)}</b>. We'll confirm your date and details within 1 business day.</p>${detailRows(rows)}`,
        cta: "View your booking", ctaUrl: `${SITE()}/booking?ref=${b.ref}&e=${encodeURIComponent(b.email)}`,
      }),
    }),
    sendEmail({
      to: NOTIFY_EMAIL(), subject: `New booking request: ${b.org_name} (${b.group_size} people)`,
      html: layout({ heading: "New team building request", body: detailRows([["Company", esc(b.org_name)], ["Contact", `${esc(b.contact_name)}, ${esc(b.email)}${b.phone ? ", " + esc(b.phone) : ""}`], ...rows, ["Notes", esc(b.notes)]]),
        cta: "Open in dashboard", ctaUrl: `${SITE()}/admin#booking-${b.id}` }),
    }),
  ]);
}

export function depositRequest(b, url) {
  return sendEmail({
    to: b.email, toName: b.contact_name, subject: `Your event quote and deposit link (${b.ref})`,
    html: layout({
      heading: "Your event is ready to lock in",
      body: `<p>Here's the quote for <b>${esc(b.org_name)}</b>'s team building event.</p>
      ${detailRows([["Total", money(b.total_cents)], [`Deposit (${RULES.depositPercent}%)`, money(b.deposit_cents)], ["Balance", `${money(b.total_cents - b.deposit_cents)}, invoiced and due ${RULES.balanceDueDaysBefore} days before the event`], ["Date", esc(fmtDate(b.preferred_date + "T17:00:00Z"))]])}
      <p style="font-size:14px;color:#4B5E72">Free reschedule up to ${RULES.freeRescheduleDays} days before. Deposit refundable until ${RULES.refundableUntilDays} days before.</p>`,
      cta: "Pay deposit and confirm", ctaUrl: url,
    }),
  });
}

export function bookingConfirmed(b, ev) {
  const team = `${SITE()}/team/${b.portal_code}`, org = `${team}?k=${b.organizer_token}`;
  return Promise.all([
    sendEmail({
      to: b.email, toName: b.contact_name, subject: `Confirmed! ${b.org_name}'s impact event is booked`, attachments: [ics(ev)],
      html: layout({
        heading: "You're booked!",
        body: `<p>Your date is locked in. Here are your two links:</p>
        <p><b>1. Your team's RSVP page.</b> Send this to everyone attending. They'll RSVP and see the address, agenda and what to wear:<br><a href="${team}" style="color:#13294B">${team}</a></p>
        <p><b>2. Your organizer page.</b> Just for you: live headcount and who's coming. Keep this one private:<br><a href="${org}" style="color:#13294B">${org}</a></p>
        ${detailRows([["When", esc(fmtWhen(ev.starts_at, ev.ends_at))], ["Where", where(ev)], ["Cause", esc(b.cause)], ["Group size", String(b.group_size)], b.balance_invoice_url ? ["Balance", `<a href="${b.balance_invoice_url}" style="color:#13294B">View invoice</a>, due ${RULES.balanceDueDaysBefore} days before`] : ["", ""]])}`,
        cta: "Open organizer page", ctaUrl: org,
      }),
    }),
    sendEmail({ to: NOTIFY_EMAIL(), subject: `Booked: ${b.org_name} on ${fmtDate(ev.starts_at)}`,
      html: layout({ heading: "Booking confirmed", body: `<p>${esc(b.org_name)} is confirmed (${esc(b.ref)}).</p>`, cta: "Open in dashboard", ctaUrl: `${SITE()}/admin#event-${ev.id}` }) }),
  ]);
}

export function organizerDigest(b, ev, going) {
  const org = `${SITE()}/team/${b.portal_code}?k=${b.organizer_token}`;
  return sendEmail({
    to: b.email, toName: b.contact_name, subject: `Tomorrow: ${going} people are coming`,
    html: layout({ heading: "Your event is tomorrow!", body: `<p><b>${going}</b> of your team have RSVP'd for ${esc(fmtWhen(ev.starts_at, ev.ends_at))}. We'll have everything ready.</p>`,
      cta: "See the full list", ctaUrl: org }),
  });
}

export function reportReady(ev, r, { org } = {}) {
  const report = `${SITE()}/report/${ev.report_token}`;
  const cert = r && r.checked_in_at ? `<p><a href="${SITE()}/certificate/${r.token}" style="color:#13294B">Download your volunteer-hours certificate</a></p>` : "";
  return sendEmail({
    to: r ? r.email : org.email, toName: r ? r.name : org.contact_name,
    subject: `Here's the impact you made: ${ev.title}`,
    html: layout({
      heading: "Look what you did!",
      body: `<p>Thank you for showing up for <b>${esc(ev.title)}</b>. Your impact report is ready, with photos and totals you can share.</p>${cert}
      <p>Got 30 seconds? Tell us how it went at the bottom of the report.</p>`,
      cta: "See your impact report", ctaUrl: report,
    }),
  });
}

export function teamInvite(email, role) {
  return sendEmail({
    to: email, subject: "You've been added to the That's Just Good dashboard",
    html: layout({ heading: "Welcome to the team", body: `<p>You now have <b>${esc(role)}</b> access to the That's Just Good events dashboard. Sign in with this email address; we'll send you a one-time sign-in link.</p>`,
      cta: "Open the dashboard", ctaUrl: `${SITE()}/admin` }),
  });
}

export function eventCancelled(ev, r) {
  return sendEmail({
    to: r.email, toName: r.name, subject: `Canceled: ${ev.title}`,
    html: layout({ heading: "This event was canceled", body: `<p>We're sorry, <b>${esc(ev.title)}</b> on ${esc(fmtDate(ev.starts_at))} has been canceled. We'll let you know about the next one.</p>`,
      cta: "See upcoming events", ctaUrl: `${SITE()}/community#popup-list` }),
  });
}
