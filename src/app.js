// That's Just Good events: calendar, event pages, RSVPs, the team building planner, booking status,
// company team pages, impact reports and certificates. Talks to the site's /api.
import { estimate, earliestDate, validateBooking, RULES, DURATIONS, CAUSES, money } from "/assets/pricing.js";

const TZ = "America/Chicago";
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso, o) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, ...o });
const day = (iso) => fmt(iso, { weekday: "long", month: "long", day: "numeric" });
const time = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit" });
const when = (e) => `${day(e.starts_at)} · ${time(e.starts_at)} to ${time(e.ends_at)}`;
const pathTail = () => decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
const qs = (k) => new URLSearchParams(location.search).get(k);
const mapUrl = (a) => `https://maps.google.com/?q=${encodeURIComponent(a)}`;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status });
  return data;
}
const alertBox = (msg, kind = "") => `<div class="alert ${kind}" role="${kind === "error" ? "alert" : "status"}">${esc(msg)}</div>`;
const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Working…"; } else if (btn.dataset.label) btn.textContent = btn.dataset.label; };
const spotsPill = (e) => {
  if (e.spots_left == null) return `<span class="pill sky">Open</span>`;
  if (e.spots_left === 0) return `<span class="pill warn">${e.waitlist ? "Waitlist open" : "Full"}</span>`;
  if (e.spots_left <= 10) return `<span class="pill hot">${e.spots_left} spot${e.spots_left === 1 ? "" : "s"} left</span>`;
  return `<span class="pill ok">${e.spots_left} spots open</span>`;
};
const facts = (e, extra = []) => `<div class="facts">
  <div><span class="k">When</span><span class="v">${esc(when(e))}</span></div>
  ${e.venue_name || e.address ? `<div><span class="k">Where</span><span class="v">${esc(e.venue_name || "")}${e.venue_name && e.address ? "<br>" : ""}${e.address ? `<a href="${mapUrl(e.address)}" target="_blank" rel="noopener">${esc(e.address)}</a>` : ""}</span></div>` : ""}
  ${e.cause ? `<div><span class="k">Cause</span><span class="v">${esc(e.cause)}</span></div>` : ""}
  ${e.parking ? `<div><span class="k">Parking</span><span class="v">${esc(e.parking)}</span></div>` : ""}
  ${e.what_to_bring ? `<div><span class="k">Bring</span><span class="v">${esc(e.what_to_bring)}</span></div>` : ""}
  ${extra.join("")}</div>`;

/* ---------------- Upcoming events lists (community, kids, home) ---------------- */
async function upcomingLists() {
  const boxes = document.querySelectorAll("[data-upcoming]");
  if (!boxes.length) return;
  let events = [];
  try { events = (await api("/api/events")).events; } catch { return; }
  boxes.forEach((box) => {
    const kinds = box.dataset.upcoming.split(",");
    const list = events.filter((e) => kinds.includes(e.kind)).slice(0, Number(box.dataset.limit || 20));
    const empty = box.parentElement.querySelector("[data-upcoming-empty]");
    if (!list.length) { box.hidden = true; if (empty) empty.hidden = false; box.closest("[data-hide-when-empty]")?.setAttribute("hidden", ""); return; }
    if (empty) empty.hidden = true;
    box.hidden = false;
    box.closest("[data-hide-when-empty]")?.removeAttribute("hidden");
    box.innerHTML = list.map((e) => `<li><a class="event-card" href="/events/${encodeURIComponent(e.slug)}">
      <span class="datebox" aria-hidden="true"><span class="m">${fmt(e.starts_at, { month: "short" })}</span><span class="d">${fmt(e.starts_at, { day: "numeric" })}</span><span class="w">${fmt(e.starts_at, { weekday: "short" })}</span></span>
      <span class="stack" style="gap:4px;min-width:0"><h3>${esc(e.title)}</h3><span class="meta">${esc(time(e.starts_at))} · ${esc(e.venue_name || e.address || "Dallas-Fort Worth")}${e.cause ? " · " + esc(e.cause) : ""}</span></span>
      ${spotsPill(e)}</a></li>`).join("");
  });
}

/* ---------------- Event page + RSVP ---------------- */
function rsvpForm(prefix, { team = false } = {}) {
  return `<form class="form" id="${prefix}-form" novalidate>
    <h2 style="font-size:1.4rem">${team ? "RSVP for your team's event" : "Save your spot"}</h2>
    <div class="form-row">
      <div class="field"><label for="${prefix}-name">Your name</label><input id="${prefix}-name" name="name" required autocomplete="name"></div>
      <div class="field"><label for="${prefix}-email">Email</label><input id="${prefix}-email" name="email" type="email" required autocomplete="email"></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="${prefix}-phone">Mobile (optional)</label><input id="${prefix}-phone" name="phone" type="tel" autocomplete="tel" placeholder="For a text reminder"></div>
      ${team ? "" : `<div class="field"><label for="${prefix}-party">How many people, including you?</label><select id="${prefix}-party" name="party_size">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></div>`}
    </div>
    <label class="check"><input type="checkbox" name="sms_opt_in" id="${prefix}-sms"> Text me a reminder the day before. Message rates may apply; reply STOP to opt out.</label>
    ${team ? "" : `<label class="check"><input type="checkbox" name="email_opt_in" id="${prefix}-list" checked> Tell me about future pop-ups.</label>`}
    <div><button class="btn" type="submit">${team ? "I'll be there" : "RSVP"}</button></div>
    <div class="form-msg" aria-live="polite"></div>
  </form>`;
}
function readRsvp(form) {
  const f = new FormData(form);
  return { name: f.get("name"), email: f.get("email"), phone: f.get("phone"), party_size: Number(f.get("party_size") || 1), sms_opt_in: f.get("sms_opt_in") === "on", email_opt_in: f.get("email_opt_in") === "on" };
}
function rsvpDone(status, tok, e, chips = []) {
  const going = status === "going";
  return `<div class="form" role="status">
    <span class="pill ${going ? "ok" : "warn"}">${going ? "You're in" : "On the waitlist"}</span>
    <h2 style="font-size:1.5rem">${going ? "See you there!" : "We'll save you a place in line"}</h2>
    <p>${going ? "We emailed your confirmation, a calendar invite and your check-in code." : "This event is full. If a spot opens, we'll move you in and email you right away."}</p>
    <div class="btn-row">${e && e.slug ? `<a class="btn dark small" href="/api/events/${encodeURIComponent(e.slug)}/ics">Add to calendar</a>` : ""}<a class="btn ghost small" href="/rsvp/${tok}">View or change my RSVP</a></div>
    ${chips.length && going ? chipInBlock(tok, chips) : ""}
  </div>`;
}
function chipInBlock(tok, chips) {
  return `<div class="stack" style="gap:10px;margin-top:8px"><h3>Chip in for supplies (optional)</h3>
    <p class="muted">Every dollar goes to supplies for this pop-up.</p>
    <div class="amounts">${chips.map((c) => `<button class="btn ghost small" type="button" data-chip="${c}" data-tok="${tok}">${money(c)}</button>`).join("")}</div><div class="chip-msg" aria-live="polite"></div></div>`;
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-chip]");
  if (!b) return;
  busy(b, true, "Opening…");
  try { location.href = (await api(`/api/rsvp/${b.dataset.tok}/chip-in`, { method: "POST", body: { amount_cents: Number(b.dataset.chip) } })).url; }
  catch (e) { b.closest(".stack").querySelector(".chip-msg").innerHTML = alertBox(e.message, "error"); busy(b, false); }
});

async function eventPage(root) {
  const slug = pathTail();
  try {
    const { event: e, chip_in } = await api(`/api/events/${encodeURIComponent(slug)}`);
    document.title = `${e.title} | That's Just Good`;
    const past = new Date(e.ends_at) < new Date();
    root.innerHTML = `
    <section class="page-hero ${e.kind === "kids" ? "sun" : "coral"}"><div class="wrap stack">
      <span class="eyebrow">${e.kind === "kids" ? "Kids event" : "Community pop-up"}${e.cause ? " · " + esc(e.cause) : ""}</span>
      <h1>${esc(e.title)}</h1>
      <p class="lede">${esc(when(e))}${e.venue_name ? " · " + esc(e.venue_name) : ""}</p>
      <div class="btn-row">${spotsPill(e)}</div>
    </div></section>
    <section class="band"><div class="wrap split wide-left">
      <div class="stack-lg">
        ${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ""}
        ${e.description ? `<div class="prose">${esc(e.description).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : ""}
        ${facts(e)}
        <div class="btn-row"><a class="btn ghost small" href="/api/events/${encodeURIComponent(e.slug)}/ics">Add to calendar</a>${e.address ? `<a class="btn ghost small" href="${mapUrl(e.address)}" target="_blank" rel="noopener">Get directions</a>` : ""}<button class="btn ghost small" type="button" data-share>Share</button></div>
      </div>
      <div class="sticky-card" id="rsvp-area">${past ? alertBox("This event already happened. See what's coming up next on our Community page.") : e.status === "cancelled" ? alertBox("This event was canceled.", "error") : rsvpForm("ev")}</div>
    </div></section>`;
    const form = $("#ev-form");
    if (form) form.addEventListener("submit", async (s) => {
      s.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const btn = form.querySelector("[type=submit]"), msg = form.querySelector(".form-msg");
      busy(btn, true, "Saving your spot…");
      try {
        const r = await api(`/api/events/${encodeURIComponent(slug)}/rsvp`, { method: "POST", body: readRsvp(form) });
        $("#rsvp-area").innerHTML = rsvpDone(r.status, r.token, e, e.allow_chip_in ? chip_in : []);
      } catch (err) { msg.innerHTML = alertBox(err.message, "error"); busy(btn, false); }
    });
  } catch (err) {
    root.innerHTML = `<section class="band"><div class="wrap stack">${alertBox(err.message, "error")}<p><a class="btn" href="/community#popup-list">See upcoming events</a></p></div></section>`;
  }
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-share]");
  if (!b) return;
  const url = location.href.split("?")[0];
  try { if (navigator.share) { await navigator.share({ title: document.title, url }); return; } } catch {}
  try { await navigator.clipboard.writeText(url); b.textContent = "Link copied"; setTimeout(() => (b.textContent = "Share"), 1800); } catch { prompt("Copy this link", url); }
});
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-copy-text]");
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copyText); const o = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = o), 1600); }
  catch { const code = b.parentElement.querySelector("code"); if (code) { const r = document.createRange(); r.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(r); } }
});

/* ---------------- Manage RSVP ---------------- */
async function rsvpPage(root) {
  const tok = pathTail();
  const render = async (note) => {
    try {
      const { rsvp: r, event: e, team, chip_in } = await api(`/api/rsvp/${encodeURIComponent(tok)}`);
      const cancelled = r.status === "cancelled";
      root.innerHTML = `
      <section class="page-hero ink"><div class="wrap stack">
        <span class="eyebrow" style="color:var(--sky)">Your RSVP</span>
        <h1>${esc(e.title)}</h1>
        <p class="lede">${esc(when(e))}</p>
        <div class="btn-row"><span class="pill ${cancelled ? "" : r.status === "going" ? "ok" : "warn"}">${cancelled ? "Canceled" : r.status === "going" ? "You're going" : "On the waitlist"}</span>${r.checked_in ? `<span class="pill sky">Checked in</span>` : ""}</div>
      </div></section>
      <section class="band"><div class="wrap split wide-left">
        <div class="stack-lg">
          ${qs("paid") ? alertBox("Thank you! Your contribution came through.", "success") : ""}${note || ""}
          ${facts(e, [`<div><span class="k">Name</span><span class="v">${esc(r.name)}</span></div>`, `<div><span class="k">Group</span><span class="v">${r.party_size} ${r.party_size === 1 ? "person" : "people"}</span></div>`])}
          ${cancelled ? "" : `<form class="form" id="party-form"><h3>Change your group size</h3><div class="form-row"><div class="field"><label for="party">People, including you</label><select id="party" name="party">${Array.from({ length: 10 }, (_, i) => `<option ${i + 1 === r.party_size ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div><div class="field" style="align-content:end"><button class="btn dark" type="submit">Update</button></div></div><div class="form-msg" aria-live="polite"></div></form>
          <div class="stack" style="gap:10px"><h3>Can't make it?</h3><p class="muted">Cancel so someone on the waitlist can take your spot.</p><div><button class="btn ghost" type="button" id="cancel-btn">Cancel my RSVP</button></div><div id="cancel-confirm" hidden class="alert error"><p style="margin:0 0 10px">Cancel your RSVP for ${esc(e.title)}?</p><div class="btn-row"><button class="btn small" type="button" id="cancel-yes">Yes, cancel</button><button class="btn ghost small" type="button" id="cancel-no">Keep my spot</button></div></div></div>`}
        </div>
        <div class="sticky-card stack">
          ${cancelled ? `<a class="btn" href="/community#popup-list">See other events</a>` : `<div class="form" style="justify-items:start"><h3>Your check-in code</h3><img class="qr" src="/api/qr/${encodeURIComponent(tok)}.png" alt="Check-in QR code" width="180" height="180"><p class="muted">Show this at the door. It's also in your confirmation email.</p>
          ${team ? "" : `<a class="btn ghost small" href="/api/events/${encodeURIComponent(e.slug)}/ics">Add to calendar</a>`}
          ${chip_in.length && r.status === "going" ? chipInBlock(tok, chip_in) : ""}</div>`}
        </div>
      </div></section>`;
      $("#party-form")?.addEventListener("submit", async (s) => {
        s.preventDefault();
        const btn = s.target.querySelector("button"); busy(btn, true, "Updating…");
        try { await api(`/api/rsvp/${encodeURIComponent(tok)}`, { method: "POST", body: { action: "party", party_size: Number($("#party").value) } }); render(alertBox("Updated. Thanks for letting us know.", "success")); }
        catch (e2) { s.target.querySelector(".form-msg").innerHTML = alertBox(e2.message, "error"); busy(btn, false); }
      });
      $("#cancel-btn")?.addEventListener("click", () => { $("#cancel-confirm").hidden = false; $("#cancel-btn").hidden = true; });
      $("#cancel-no")?.addEventListener("click", () => { $("#cancel-confirm").hidden = true; $("#cancel-btn").hidden = false; });
      $("#cancel-yes")?.addEventListener("click", async (c) => {
        busy(c.target, true, "Canceling…");
        try { await api(`/api/rsvp/${encodeURIComponent(tok)}`, { method: "POST", body: { action: "cancel" } }); render(alertBox("Your RSVP is canceled. Hope to see you at the next one!", "success")); }
        catch (e2) { busy(c.target, false); }
      });
    } catch (err) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox(err.message, "error")}</div></section>`; }
  };
  render();
}

/* ---------------- Team building planner ---------------- */
function planPage(root) {
  const form = $("#plan-form", root), panel = $("#estimate", root);
  panel.innerHTML = `<div class="stack" style="gap:16px" id="est-body"></div><div class="stack" style="gap:10px" id="est-actions"></div><div class="form-msg" aria-live="polite"></div>`;
  const body = $("#est-body", panel), actions = $("#est-actions", panel);
  const minDate = earliestDate();
  form.querySelectorAll('input[type="date"]').forEach((d) => (d.min = minDate));
  form.querySelector("#p-causes").innerHTML = CAUSES.map((c, i) => `<label class="chip-option"><input type="radio" name="cause" value="${esc(c)}" ${i === 0 ? "" : ""} required><span>${esc(c)}</span></label>`).join("");
  form.querySelector("#p-durations").innerHTML = DURATIONS.map((d) => `<label class="option"><input type="radio" name="duration_min" value="${d.minutes}" ${d.minutes === 120 ? "checked" : ""}><b>${esc(d.label)}</b><span>Host Only ${money({ 90: 125000, 120: 150000, 180: 200000 }[d.minutes])}</span></label>`).join("");
  const pre = qs("format"); if (pre) { const r = form.querySelector(`input[name=format][value="${pre}"]`); if (r) r.checked = true; }
  const read = () => {
    const f = new FormData(form);
    return {
      format: f.get("format"), cause: f.get("cause") === "Something else" ? (f.get("cause_other") || "Something else") : f.get("cause"),
      group_size: Number(f.get("group_size")), duration_min: Number(f.get("duration_min")), preferred_date: f.get("preferred_date"),
      alt_date: f.get("alt_date"), start_time: f.get("start_time"), location_type: f.get("location_type"), address: f.get("address"),
      org_name: f.get("org_name"), contact_name: f.get("contact_name"), email: f.get("email"), phone: f.get("phone"), notes: f.get("notes"),
    };
  };
  const draw = () => {
    const b = read();
    form.querySelector("#cause-other-wrap").hidden = form.querySelector('input[name=cause]:checked')?.value !== "Something else";
    const est = estimate({ format: b.format, minutes: b.duration_min, groupSize: b.group_size });
    const ready = b.format && b.duration_min;
    let html = `<span class="eyebrow" style="color:var(--sky)">Your estimate</span>`;
    if (!ready) html += `<p class="muted">Choose a format and length to see your price.</p>`;
    else if (est.quote) html += `<div class="total">Custom quote</div><p class="muted">${esc(est.reason)}</p>${est.hostFee ? `<div class="lines"><div><span>Host fee</span><span>${money(est.hostFee)}</span></div><div><span>Supplies for ${b.group_size || "your"} people</span><span>Quoted</span></div></div>` : ""}`;
    else html += `<div class="total">${money(est.total)}</div><div class="lines">${est.lines.map((l) => `<div><span>${esc(l.label)}</span><span>${money(l.cents)}</span></div>`).join("")}<div><span><b>Deposit today (${RULES.depositPercent}%)</b></span><span><b>${money(est.deposit)}</b></span></div><div class="muted"><span>Balance, due ${RULES.balanceDueDaysBefore} days before</span><span>${money(est.total - est.deposit)}</span></div></div>`;
    html += `<hr><ul class="ticks" style="font-size:.95rem">
      <li>${b.format === "all_inclusive" ? "All supplies, setup and cleanup" : "You provide the supplies; we run the room"}</li>
      <li>A host who keeps the energy up</li><li>Delivery to a partner charity</li><li>An impact report your team can share</li>
      <li>Free reschedule up to ${RULES.freeRescheduleDays} days before</li></ul><hr>`;
    const instant = ready && !est.quote;
    body.innerHTML = html;
    // Buttons and messages live outside the redrawn area, so a click is never lost mid-redraw
    const key = instant ? `pay:${est.deposit}` : "quote";
    if (actions.dataset.key !== key) {
      actions.dataset.key = key;
      actions.innerHTML = instant
        ? `<button class="btn" type="submit" form="plan-form" data-pay="1">Reserve with ${money(est.deposit)} deposit</button><button class="btn ghost" type="submit" form="plan-form" data-pay="0">Request without paying</button><p class="muted" style="font-size:.88rem;margin:0">Deposit is fully refundable if we can't confirm your date.</p>`
        : `<button class="btn" type="submit" form="plan-form" data-pay="0">Request my quote</button>`;
    }
  };
  form.addEventListener("input", draw); form.addEventListener("change", draw); draw();
  form.addEventListener("submit", async (s) => {
    s.preventDefault();
    const btn = s.submitter, msg = panel.querySelector(".form-msg");
    const b = read();
    const problems = validateBooking(b);
    if (problems.length) { msg.innerHTML = `<div class="alert error" role="alert"><b>Almost there:</b><ul style="margin:6px 0 0;padding-left:18px">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`; return; }
    busy(btn, true, btn?.dataset.pay === "1" ? "Opening secure checkout…" : "Sending…");
    try {
      const r = await api("/api/bookings", { method: "POST", body: { ...b, pay_now: btn?.dataset.pay === "1" } });
      location.href = r.checkoutUrl || `/booking?ref=${r.ref}&e=${encodeURIComponent(r.email)}&new=1`;
    } catch (err) {
      if (err.status === 503) {
        // Booking system not connected yet: send the request as a regular form so no lead is lost
        const est = estimate({ format: b.format, minutes: b.duration_min, groupSize: b.group_size });
        const data = new URLSearchParams({ "form-name": "team-booking", ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ""])), estimate: est.quote ? "Custom quote" : money(est.total) });
        try {
          const ok = (await fetch("/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: data.toString() })).ok;
          if (!ok) throw new Error();
          form.closest(".planner").innerHTML = `<div class="stack" style="max-width:640px">${alertBox("Request received! We'll email you within 1 business day to confirm your date and next steps.", "success")}<p><a class="btn" href="/">Back to home</a></p></div>`;
          return;
        } catch { msg.innerHTML = alertBox("We couldn't send that. Please email dogood@thatsjustgood.com and we'll get you booked.", "error"); busy(btn, false); return; }
      }
      msg.innerHTML = alertBox(err.message, "error"); busy(btn, false);
    }
  });
}

/* ---------------- Booking status ---------------- */
async function bookingPage(root) {
  const ref = qs("ref"), email = qs("e");
  const STEPS = [["requested", "Request received", "We'll confirm your date within 1 business day."], ["quoted", "Quote and deposit", "Pay the deposit to lock your date."], ["confirmed", "Confirmed", "Share your team RSVP link."], ["completed", "Impact report", "Photos and totals to share."]];
  const order = { requested: 0, quoted: 1, deposit_pending: 1, confirmed: 2, completed: 3, cancelled: -1 };
  let tries = 0;
  const render = async () => {
    try {
      const b = await api(`/api/bookings/${encodeURIComponent(ref)}?e=${encodeURIComponent(email)}`);
      if (qs("paid") && b.status !== "confirmed" && tries++ < 6) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox("Payment received. Confirming your booking…")}</div></section>`; return setTimeout(render, 2500); }
      const at = order[b.status] ?? 0;
      root.innerHTML = `
      <section class="page-hero sky"><div class="wrap stack">
        <span class="eyebrow">Booking ${esc(b.ref)}</span>
        <h1>${b.status === "confirmed" || b.status === "completed" ? "You're booked!" : b.status === "cancelled" ? "Booking canceled" : "We got your request"}</h1>
        <p class="lede">${esc(b.org_name)} · ${b.group_size} people · ${esc(new Date(b.preferred_date + "T17:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}</p>
      </div></section>
      <section class="band"><div class="wrap split wide-left">
        <div class="stack-lg">
          ${qs("new") ? alertBox(`Thanks, ${b.contact_name.split(" ")[0]}! We emailed a copy to ${email}.`, "success") : ""}
          ${qs("paid") && b.deposit_paid ? alertBox("Deposit received. Your date is locked in.", "success") : ""}
          ${b.team_url ? `<div class="stack" style="gap:12px"><h2>Your links</h2>
            <p><b>Team RSVP page.</b> Send this to everyone attending:</p><div class="copy-box"><code>${esc(b.team_url)}</code><button class="btn small dark" type="button" data-copy-text="${esc(b.team_url)}">Copy</button></div>
            <p><b>Organizer page.</b> Live headcount, just for you. Keep it private:</p><div class="copy-box"><code>${esc(b.organizer_url)}</code><a class="btn small" href="${esc(b.organizer_url)}">Open</a></div>
            ${b.balance_invoice_url ? `<p><a href="${esc(b.balance_invoice_url)}" target="_blank" rel="noopener">View or pay your balance invoice</a></p>` : ""}</div>` : ""}
          ${["quoted", "deposit_pending"].includes(b.status) && b.deposit_cents ? `<div class="form"><h3>Lock in your date</h3><p>Total ${money(b.total_cents)}. Deposit due now: <b>${money(b.deposit_cents)}</b>.</p><div><button class="btn" type="button" id="pay-dep">Pay deposit</button></div><div class="form-msg"></div></div>` : ""}
          <div class="facts">
            <div><span class="k">Format</span><span class="v">${b.format === "host_only" ? "Host Only" : "All-Inclusive"}</span></div>
            <div><span class="k">Cause</span><span class="v">${esc(b.cause)}</span></div>
            <div><span class="k">Length</span><span class="v">${b.duration_min} minutes</span></div>
            <div><span class="k">Price</span><span class="v">${b.total_cents ? money(b.total_cents) + (b.deposit_paid ? ` (deposit of ${money(b.deposit_cents)} paid)` : "") : "Custom quote coming within 1 business day"}</span></div>
          </div>
        </div>
        <div><ol class="timeline">${STEPS.map(([k, t, d], i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"><div><b>${t}</b><span>${d}</span></div></li>`).join("")}</ol>
        <p class="muted">Questions? Email <a href="mailto:dogood@thatsjustgood.com">dogood@thatsjustgood.com</a> with your reference ${esc(b.ref)}.</p></div>
      </div></section>`;
      $("#pay-dep")?.addEventListener("click", async (c) => {
        busy(c.target, true, "Opening secure checkout…");
        try { location.href = (await api(`/api/bookings/${encodeURIComponent(ref)}/deposit?e=${encodeURIComponent(email)}`, { method: "POST" })).url; }
        catch (e2) { c.target.closest(".form").querySelector(".form-msg").innerHTML = alertBox(e2.message, "error"); busy(c.target, false); }
      });
    } catch (err) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox(err.message, "error")}</div></section>`; }
  };
  if (!ref || !email) root.innerHTML = `<section class="band"><div class="wrap">${alertBox("Open this page from the link in your booking email.", "error")}</div></section>`;
  else render();
}

/* ---------------- Company team page ---------------- */
async function teamPage(root) {
  const code = pathTail(), k = qs("k");
  try {
    const t = await api(`/api/team/${encodeURIComponent(code)}${k ? `?k=${encodeURIComponent(k)}` : ""}`);
    const e = t.event, o = t.organizer;
    document.title = `${t.org_name} Impact Event | That's Just Good`;
    const teamUrl = location.origin + "/team/" + code;
    const pct = Math.min(100, Math.round((t.going / Math.max(1, t.group_size)) * 100));
    root.innerHTML = `
    <section class="page-hero sky"><div class="wrap stack">
      <span class="eyebrow">${esc(t.org_name)} × That's Just Good</span>
      <h1>${esc(e.title)}</h1>
      <p class="lede">${esc(when(e))}</p>
      <div class="btn-row"><span class="pill ok">${t.going} going</span>${o ? `<span class="pill">Organizer view</span>` : ""}</div>
    </div></section>
    <section class="band"><div class="wrap split wide-left">
      <div class="stack-lg">
        ${o ? `<div class="stack" style="gap:12px"><h2>Who's coming</h2>
          <p><b>${t.going}</b> of ${t.group_size} expected</p><div class="meter" role="img" aria-label="${t.going} of ${t.group_size} RSVP'd"><i style="width:${pct}%"></i></div>
          <p><b>Share this RSVP link with your team:</b></p><div class="copy-box"><code>${esc(teamUrl)}</code><button class="btn small dark" type="button" data-copy-text="${esc(teamUrl)}">Copy link</button></div>
          ${o.balance_invoice_url ? `<p>${o.balance_paid ? `<span class="pill ok">Balance paid</span>` : `<a href="${esc(o.balance_invoice_url)}" target="_blank" rel="noopener">View or pay your balance invoice</a>`}</p>` : ""}
          ${o.report_url ? `<p><a class="btn" href="${esc(o.report_url)}">See your impact report</a></p>` : ""}
          <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Checked in</th></tr></thead><tbody>
          ${o.rsvps.length ? o.rsvps.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${r.checked_in ? "Yes" : ""}</td></tr>`).join("") : `<tr><td colspan="3" class="muted">No RSVPs yet. Share the link above with your team.</td></tr>`}
          </tbody></table></div></div>` : ""}
        ${e.summary ? `<p class="lede">${esc(e.summary)}</p>` : ""}
        ${facts(e, [`<div><span class="k">Wear</span><span class="v">Comfortable clothes you don't mind getting a little messy</span></div>`])}
        <div class="stack" style="gap:8px"><h3>What to expect</h3><ul class="ticks"><li>A quick welcome and the story behind the cause</li><li>Hands-on time building something that helps people right away</li><li>A wrap-up where you see the impact your team made together</li></ul></div>
      </div>
      <div class="sticky-card" id="rsvp-area">${new Date(e.ends_at) < new Date() ? alertBox("This event already happened. Thank you for showing up!") : rsvpForm("tm", { team: true })}</div>
    </div></section>`;
    const form = $("#tm-form");
    if (form) form.addEventListener("submit", async (s) => {
      s.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const btn = form.querySelector("[type=submit]"); busy(btn, true, "Saving…");
      try { const r = await api(`/api/team/${encodeURIComponent(code)}/rsvp`, { method: "POST", body: readRsvp(form) }); $("#rsvp-area").innerHTML = rsvpDone(r.status, r.token, null); }
      catch (err) { form.querySelector(".form-msg").innerHTML = alertBox(err.message, "error"); busy(btn, false); }
    });
  } catch (err) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox(err.message, "error")}</div></section>`; }
}

/* ---------------- Impact report ---------------- */
async function reportPage(root) {
  const tok = pathTail();
  try {
    const r = await api(`/api/report/${encodeURIComponent(tok)}`);
    document.title = `Impact report: ${r.title} | That's Just Good`;
    const who = r.org ? `${r.org} showed up` : "We showed up";
    const share = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`;
    root.innerHTML = `
    <section class="page-hero ink"><div class="wrap stack">
      <span class="eyebrow" style="color:var(--sky)">Impact report · ${esc(day(r.starts_at))}</span>
      <h1>${esc(who)} and did good</h1>
      <p class="lede muted">${esc(r.title)}${r.cause ? " · " + esc(r.cause) : ""}${r.partner ? ` · with ${esc(r.partner)}` : ""}</p>
      <div class="btn-row"><a class="btn" href="${share}" target="_blank" rel="noopener">Share on LinkedIn</a><button class="btn ghost" type="button" data-share>Copy link</button></div>
    </div></section>
    <section class="band"><div class="wrap stack-lg">
      <div class="impact-stats">
        ${r.items.map((i) => `<div class="impact-stat"><b>${Number(i.count).toLocaleString()}</b><span>${esc(i.label)}</span></div>`).join("")}
        <div class="impact-stat"><b>${r.people}</b><span>people showed up</span></div>
        <div class="impact-stat"><b>${r.hours}</b><span>volunteer hours</span></div>
      </div>
      ${r.summary ? `<p class="lede" style="max-width:62ch">${esc(r.summary)}</p>` : ""}
      ${r.photos.length ? `<div class="photo-grid">${r.photos.map((p) => `<img src="${esc(p)}" alt="Photo from ${esc(r.title)}" loading="lazy">`).join("")}</div>` : ""}
    </div></section>
    <section class="band sky"><div class="wrap split">
      <div class="stack"><span class="eyebrow">Your turn</span><h2>How did it go?</h2><p class="lede">30 seconds of feedback helps us make the next one even better.</p></div>
      <form class="form" id="fb-form">
        <fieldset style="border:0;padding:0;margin:0;display:grid;gap:8px"><legend style="font-weight:700;font-size:.92rem;margin-bottom:6px">Rate the experience</legend>
        <div class="stars">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span>${n}</span></label>`).join("")}</div></fieldset>
        <div class="field"><label for="fb-c">What stood out?</label><textarea id="fb-c" name="comment" rows="4"></textarea></div>
        <div class="field"><label for="fb-n">Your name (optional)</label><input id="fb-n" name="name" autocomplete="name"></div>
        <label class="check"><input type="checkbox" name="can_quote"> You can quote me on your website</label>
        <div><button class="btn" type="submit">Send feedback</button></div><div class="form-msg" aria-live="polite"></div>
      </form>
    </div></section>`;
    $("#fb-form").addEventListener("submit", async (s) => {
      s.preventDefault();
      const f = new FormData(s.target), btn = s.target.querySelector("[type=submit]");
      if (!f.get("rating")) { s.target.querySelector(".form-msg").innerHTML = alertBox("Pick a rating from 1 to 5.", "error"); return; }
      busy(btn, true, "Sending…");
      try { await api(`/api/report/${encodeURIComponent(tok)}/feedback`, { method: "POST", body: { rating: Number(f.get("rating")), comment: f.get("comment"), name: f.get("name"), can_quote: f.get("can_quote") === "on" } });
        s.target.innerHTML = alertBox("Thank you! We read every note.", "success"); }
      catch (err) { s.target.querySelector(".form-msg").innerHTML = alertBox(err.message, "error"); busy(btn, false); }
    });
  } catch (err) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox(err.message, "error")}</div></section>`; }
}

/* ---------------- Certificate ---------------- */
async function certificatePage(root) {
  const tok = pathTail();
  try {
    const c = await api(`/api/certificate/${encodeURIComponent(tok)}`);
    document.title = `Volunteer certificate: ${c.name}`;
    root.innerHTML = `<div class="cert-page"><div class="stack" style="justify-items:center;width:100%">
      <div class="certificate">
        <img class="logo" src="/images/brand/logo-stacked.svg" alt="That's Just Good" width="260" height="173">
        <span class="k">Certificate of volunteer service</span>
        <span class="name">${esc(c.name)}</span>
        <p>gave <span class="hours">${c.hours} hours</span> of service at <b>${esc(c.title)}</b>${c.cause ? `, supporting ${esc(c.cause.toLowerCase())}` : ""}${c.partner ? ` with ${esc(c.partner)}` : ""}, on ${esc(fmt(c.starts_at, { month: "long", day: "numeric", year: "numeric" }))}${c.venue_name ? ` at ${esc(c.venue_name)}` : ""}.</p>
        <div class="sig"><div>Nick Marino Jr., Founder &amp; Chief Giving Officer</div><div>Certificate ${esc(c.id)}</div></div>
      </div>
      <div class="btn-row no-print" style="margin-top:20px"><button class="btn" type="button" onclick="window.print()">Print or save as PDF</button><a class="btn ghost" href="/">That's Just Good home</a></div>
    </div></div>`;
  } catch (err) { root.innerHTML = `<section class="band"><div class="wrap">${alertBox(err.message, "error")}</div></section>`; }
}

/* ---------------- Check-in code (when someone scans their own QR) ---------------- */
function checkinPage(root) {
  const tok = pathTail();
  root.innerHTML = `<section class="band"><div class="wrap stack" style="justify-items:center;text-align:center">
    <h1 style="font-size:clamp(1.8rem,5vw,3rem)">Your check-in code</h1><p class="lede">Show this screen to the That's Just Good team at the door.</p>
    <img class="qr" style="width:240px;height:240px" src="/api/qr/${encodeURIComponent(tok)}.png" alt="Check-in QR code" width="240" height="240">
    <a class="btn ghost" href="/rsvp/${encodeURIComponent(tok)}">View my RSVP</a></div></section>`;
}

const pages = { event: eventPage, rsvp: rsvpPage, plan: planPage, booking: bookingPage, team: teamPage, report: reportPage, certificate: certificatePage, checkin: checkinPage };
const root = document.querySelector("[data-app]");
if (root && pages[root.dataset.app]) pages[root.dataset.app](root);
upcomingLists();
