// That's Just Good dashboard: events, RSVPs, check-in, impact reports, bookings and team.
import { money, CAUSES } from "/assets/pricing.js";

const TZ = "America/Chicago";
const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso, o) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, ...o });
const dateShort = (iso) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });
const timeShort = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit" });
const localParts = (iso) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const pill = (s) => ({ draft: `<span class="pill">Draft</span>`, published: `<span class="pill ok">Published</span>`, cancelled: `<span class="pill">Canceled</span>`, completed: `<span class="pill sky">Completed</span>`,
  requested: `<span class="pill hot">New request</span>`, quoted: `<span class="pill warn">Quote sent</span>`, deposit_pending: `<span class="pill warn">Awaiting deposit</span>`, confirmed: `<span class="pill ok">Confirmed</span>`,
  going: `<span class="pill ok">Going</span>`, waitlist: `<span class="pill warn">Waitlist</span>` }[s] || `<span class="pill">${esc(s)}</span>`);
const KIND = { community: "Community pop-up", kids: "Kids event", private: "Company event" };
const toast = (msg) => { const t = document.createElement("div"); t.className = "toast"; t.role = "status"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); };
const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || "Working…"; } else if (btn.dataset.l) btn.textContent = btn.dataset.l; };

let sb = null, token = null, me = null, cfg = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { await signOut(true); throw new Error("Please sign in again."); }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const can = (action) => ({ manage: ["owner", "admin"], team: ["owner"] }[action] || ["owner", "admin", "staff"]).includes(me?.role);

/* ---------------- Sign-in ---------------- */
async function boot() {
  cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({ mode: "dev" }));
  if (cfg.mode === "live" && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data } = await sb.auth.getSession();
    token = data.session?.access_token || null;
    sb.auth.onAuthStateChange((_e, session) => { token = session?.access_token || null; });
  } else {
    try { token = sessionStorage.getItem("tjg-dev-token"); } catch {}
  }
  if (!token) return loginView();
  try { me = (await api("/api/admin/me")).member; } catch (e) { return loginView(e.message); }
  $("#who").innerHTML = `<span>${esc(me.name || me.email)} · ${esc(me.role)}</span><button class="btn ghost small" type="button" id="signout">Sign out</button>`;
  $("#signout").onclick = () => signOut();
  $("#tabs").hidden = false;
  window.addEventListener("hashchange", route);
  route();
}
async function signOut(silent) {
  try { if (sb) await sb.auth.signOut(); sessionStorage.removeItem("tjg-dev-token"); } catch {}
  token = null; me = null; $("#tabs").hidden = true; $("#who").innerHTML = "";
  if (!silent) loginView();
}
function loginView(msg) {
  const dev = cfg?.mode !== "live";
  view.innerHTML = `<div class="login card">
    <h1 style="font-size:1.6rem">Dashboard sign-in</h1>
    ${msg ? `<div class="alert error">${esc(msg)}</div>` : ""}
    ${dev ? `<div class="alert">The events system isn't connected to its database yet, so the dashboard is in test mode. Nothing here is saved permanently.</div>
      <button class="btn" id="dev-in" type="button">Continue in test mode</button>`
    : `<p class="muted">Enter your email and we'll send you a one-time sign-in link.</p>
      <form id="login-form" class="stack" style="gap:12px"><div class="field"><label for="login-email">Email</label><input id="login-email" type="email" required autocomplete="email"></div>
      <div><button class="btn" type="submit">Email me a sign-in link</button></div><div id="login-msg" aria-live="polite"></div></form>`}
  </div>`;
  $("#dev-in")?.addEventListener("click", () => { token = "dev-admin"; try { sessionStorage.setItem("tjg-dev-token", token); } catch {} boot(); });
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); busy(btn, true, "Sending…");
    const { error } = await sb.auth.signInWithOtp({ email: $("#login-email").value.trim(), options: { emailRedirectTo: `${location.origin}/admin`, shouldCreateUser: false } });
    busy(btn, false);
    $("#login-msg").innerHTML = error ? `<div class="alert error">${esc(error.message.includes("Signups") ? "That email doesn't have dashboard access yet. Ask the owner to add you." : error.message)}</div>` : `<div class="alert success">Check your inbox for the sign-in link.</div>`;
  });
}

/* ---------------- Router ---------------- */
function route() {
  const h = location.hash.slice(1) || "overview";
  document.querySelectorAll("#tabs a").forEach((a) => a.toggleAttribute("aria-current", h.startsWith(a.getAttribute("href").slice(1).replace(/s$/, ""))));
  document.querySelectorAll("#tabs a").forEach((a) => { if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page"); });
  window.scrollTo(0, 0);
  const [name, id] = h.split(/-(.+)/);
  const fn = { overview, events: eventsView, event: eventView, "new": () => eventForm(), edit: () => eventForm(id), checkin: () => checkinView(id), bookings: bookingsView, booking: () => bookingView(id), team: teamView }[name];
  (fn || overview)(id).catch((e) => { view.innerHTML = `<div class="alert error">${esc(e.message)}</div>`; });
}

/* ---------------- Overview ---------------- */
async function overview() {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const o = await api("/api/admin/overview");
  view.innerHTML = `<div class="stack-lg">
    <div class="row-actions" style="justify-content:space-between"><h1>Hi ${esc((me.name || "").split(" ")[0] || "there")}</h1>${can("manage") ? `<a class="btn" href="#new">New event</a>` : ""}</div>
    <div class="adm-grid">
      <a class="kpi" href="#events" style="text-decoration:none;color:inherit"><b>${o.stats.upcoming_events}</b><span>upcoming published events</span></a>
      <a class="kpi" href="#bookings" style="text-decoration:none;color:inherit"><b>${o.stats.open_requests}</b><span>new booking requests</span></a>
      <a class="kpi" href="#events" style="text-decoration:none;color:inherit"><b>${o.stats.needs_report}</b><span>past events waiting on an impact report</span></a>
    </div>
    ${o.bookings_to_act.length ? `<div class="stack"><h2 style="font-size:1.3rem">Bookings to act on</h2>${bookingTable(o.bookings_to_act)}</div>` : ""}
    <div class="stack"><h2 style="font-size:1.3rem">Coming up</h2>${o.upcoming.length ? eventTable(o.upcoming) : `<div class="card"><p>No upcoming events yet.</p>${can("manage") ? `<div><a class="btn small" href="#new">Create your first event</a></div>` : ""}</div>`}</div>
  </div>`;
  wireRows();
}
const eventTable = (evs) => `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Event</th><th>Type</th><th>Status</th><th class="num">Going</th><th class="num">Waitlist</th><th class="num">Checked in</th></tr></thead><tbody>
  ${evs.map((e) => `<tr data-href="#event-${e.id}"><td>${esc(dateShort(e.starts_at))}<br><span class="muted-s">${esc(timeShort(e.starts_at))}</span></td><td><a href="#event-${e.id}"><b>${esc(e.title)}</b></a></td><td>${KIND[e.kind]}</td><td>${pill(e.status)}</td><td class="num">${e.counts.going}${e.capacity ? ` / ${e.capacity}` : ""}</td><td class="num">${e.counts.waitlist || ""}</td><td class="num">${e.counts.checked_in || ""}</td></tr>`).join("")}
  </tbody></table></div>`;
const bookingTable = (bs) => `<div class="table-wrap"><table class="table"><thead><tr><th>Received</th><th>Company</th><th>Event date</th><th class="num">People</th><th>Format</th><th class="num">Price</th><th>Status</th></tr></thead><tbody>
  ${bs.map((b) => `<tr data-href="#booking-${b.id}"><td>${esc(dateShort(b.created_at))}</td><td><a href="#booking-${b.id}"><b>${esc(b.org_name)}</b></a><br><span class="muted-s">${esc(b.contact_name)}</span></td><td>${esc(new Date(b.preferred_date + "T17:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</td><td class="num">${b.group_size}</td><td>${b.format === "host_only" ? "Host Only" : "All-Inclusive"}</td><td class="num">${b.total_cents ? money(b.total_cents) : "Quote"}</td><td>${pill(b.status)}</td></tr>`).join("")}
  </tbody></table></div>`;
const wireRows = () => document.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a,button")) location.hash = tr.dataset.href; }));

/* ---------------- Events ---------------- */
async function eventsView() {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const { events } = await api("/api/admin/events");
  const now = new Date().toISOString();
  const up = events.filter((e) => e.ends_at >= now), past = events.filter((e) => e.ends_at < now).reverse();
  view.innerHTML = `<div class="stack-lg">
    <div class="row-actions" style="justify-content:space-between"><h1>Events</h1>${can("manage") ? `<a class="btn" href="#new">New event</a>` : ""}</div>
    <div class="stack"><h2 style="font-size:1.3rem">Upcoming</h2>${up.length ? eventTable(up) : `<p class="muted">Nothing scheduled.</p>`}</div>
    <div class="stack"><h2 style="font-size:1.3rem">Past</h2>${past.length ? eventTable(past) : `<p class="muted">No past events yet.</p>`}</div></div>`;
  wireRows();
}

async function eventForm(id) {
  if (!can("manage")) { view.innerHTML = `<div class="alert error">Your role can't create or edit events.</div>`; return; }
  let e = { kind: "community", status: "draft", waitlist: true, allow_chip_in: false };
  if (id) e = (await api(`/api/admin/events/${id}`)).event;
  const s = e.starts_at ? localParts(e.starts_at) : { date: "", time: "10:00" }, en = e.ends_at ? localParts(e.ends_at) : { time: "12:00" };
  view.innerHTML = `<div class="stack-lg">
    <div class="row-actions"><a href="${id ? "#event-" + id : "#events"}">← Back</a></div>
    <h1>${id ? "Edit event" : "New event"}</h1>
    <form class="form" id="ev-form" style="max-width:820px">
      <div class="form-row"><div class="field"><label for="f-title">Title</label><input id="f-title" name="title" required value="${esc(e.title)}" placeholder="Blanket Drive Pop-Up"></div>
        <div class="field"><label for="f-kind">Type</label><select id="f-kind" name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${e.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
      <div class="form-row"><div class="field"><label for="f-cause">Cause</label><input id="f-cause" name="cause" list="causes" value="${esc(e.cause)}"><datalist id="causes">${CAUSES.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
        <div class="field"><label for="f-cap">Spots available</label><input id="f-cap" name="capacity" type="number" min="1" value="${e.capacity ?? ""}" placeholder="Leave blank for no limit"></div></div>
      <div class="form-row"><div class="field"><label for="f-date">Date</label><input id="f-date" name="date" type="date" required value="${s.date}"></div>
        <div class="form-row" style="gap:10px"><div class="field"><label for="f-start">Starts</label><input id="f-start" name="start_time" type="time" required value="${s.time}"></div><div class="field"><label for="f-end">Ends</label><input id="f-end" name="end_time" type="time" required value="${en.time}"></div></div></div>
      <div class="form-row"><div class="field"><label for="f-venue">Venue name</label><input id="f-venue" name="venue_name" value="${esc(e.venue_name)}"></div>
        <div class="field"><label for="f-addr">Address</label><input id="f-addr" name="address" value="${esc(e.address)}"></div></div>
      <div class="field"><label for="f-sum">One-line summary (shows on the calendar and in emails)</label><input id="f-sum" name="summary" maxlength="200" value="${esc(e.summary)}"></div>
      <div class="field"><label for="f-desc">Full description</label><textarea id="f-desc" name="description" rows="5">${esc(e.description)}</textarea></div>
      <div class="form-row"><div class="field"><label for="f-park">Parking</label><input id="f-park" name="parking" value="${esc(e.parking)}"></div>
        <div class="field"><label for="f-bring">What to bring or wear</label><input id="f-bring" name="what_to_bring" value="${esc(e.what_to_bring)}"></div></div>
      <label class="check"><input type="checkbox" name="waitlist" ${e.waitlist ? "checked" : ""}> Open a waitlist when it fills up</label>
      <label class="check"><input type="checkbox" name="allow_chip_in" ${e.allow_chip_in ? "checked" : ""}> Let attendees chip in for supplies</label>
      <div class="field" style="max-width:280px"><label for="f-status">Status</label><select id="f-status" name="status"><option value="draft" ${e.status === "draft" ? "selected" : ""}>Draft (hidden)</option><option value="published" ${e.status === "published" ? "selected" : ""}>Published (open for RSVPs)</option></select></div>
      <div class="row-actions"><button class="btn" type="submit">${id ? "Save changes" : "Create event"}</button>${id ? "" : `<span class="muted-s">You can add impact numbers and photos after the event.</span>`}</div>
      <div id="ev-msg" aria-live="polite"></div>
    </form></div>`;
  $("#ev-form").addEventListener("submit", async (s2) => {
    s2.preventDefault();
    const f = new FormData(s2.target), btn = s2.target.querySelector("[type=submit]");
    const body = Object.fromEntries(f.entries());
    body.waitlist = f.get("waitlist") === "on"; body.allow_chip_in = f.get("allow_chip_in") === "on";
    busy(btn, true, "Saving…");
    try {
      const r = id ? await api(`/api/admin/events/${id}`, { method: "PATCH", body }) : await api("/api/admin/events", { method: "POST", body });
      toast("Saved"); location.hash = `event-${r.event.id}`;
    } catch (err) { $("#ev-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; busy(btn, false); }
  });
}

async function eventView(id) {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const d = await api(`/api/admin/events/${id}`);
  const e = d.event, rsvps = d.rsvps.filter((r) => r.status !== "cancelled"), cancelled = d.rsvps.length - rsvps.length;
  const past = new Date(e.ends_at) < new Date();
  const imp = e.impact || {};
  const publicUrl = e.kind === "private" && d.booking ? `/team/${d.booking.portal_code}` : `/events/${e.slug}`;
  view.innerHTML = `<div class="stack-lg">
    <div class="row-actions"><a href="#events">← All events</a></div>
    <div class="stack" style="gap:10px"><div class="row-actions">${pill(e.status)}<span class="pill">${KIND[e.kind]}</span></div>
      <h1>${esc(e.title)}</h1><p class="muted">${esc(fmt(e.starts_at, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))} · ${esc(timeShort(e.starts_at))} to ${esc(timeShort(e.ends_at))}${e.venue_name ? " · " + esc(e.venue_name) : ""}</p>
      <div class="row-actions">
        <a class="btn" href="#checkin-${e.id}">Check-in mode</a>
        ${can("manage") ? `<a class="btn ghost small" href="#edit-${e.id}">Edit</a>` : ""}
        ${can("manage") && e.status === "draft" ? `<button class="btn ghost small" data-status="published">Publish</button>` : ""}
        ${e.status === "published" || e.status === "completed" ? `<a class="btn ghost small" href="${publicUrl}" target="_blank" rel="noopener">View public page</a>` : ""}
        <a class="btn ghost small" href="/api/admin/events/${e.id}/export" data-download>Export RSVPs (CSV)</a>
        ${can("manage") && e.status !== "cancelled" && !past ? `<button class="btn ghost small" id="cancel-ev">Cancel event</button>` : ""}
      </div>
      <div id="cancel-box" class="alert error" hidden><p style="margin:0 0 10px">Cancel this event? Attendees can be emailed automatically.</p><label class="check"><input type="checkbox" id="cancel-notify" checked> Email everyone who RSVP'd</label><div class="row-actions" style="margin-top:10px"><button class="btn small" id="cancel-yes">Yes, cancel event</button><button class="btn ghost small" id="cancel-no">Keep it</button></div></div>
    </div>
    <div class="adm-grid">
      <div class="kpi"><b>${e.counts.going}${e.capacity ? `<span style="font-size:1rem;color:var(--muted)"> / ${e.capacity}</span>` : ""}</b><span>people going (${e.counts.rsvps} RSVP${e.counts.rsvps === 1 ? "" : "s"})</span></div>
      <div class="kpi"><b>${e.counts.waitlist}</b><span>on the waitlist</span></div>
      <div class="kpi"><b>${e.counts.checked_in}</b><span>RSVPs checked in</span></div>
      <div class="kpi"><b>${d.summary.hours}</b><span>volunteer hours${d.summary.checked_in ? "" : " (estimated from RSVPs)"}</span></div>
    </div>
    ${d.booking ? `<div class="card"><h2>Company booking</h2><p><a href="#booking-${d.booking.id}"><b>${esc(d.booking.org_name)}</b></a> · ${esc(d.booking.contact_name)} · ${esc(d.booking.email)} · ${d.booking.group_size} expected</p><div class="copy-box"><code>${esc(location.origin + "/team/" + d.booking.portal_code)}</code><button class="btn small dark" type="button" data-copy="${esc(location.origin + "/team/" + d.booking.portal_code)}">Copy team link</button></div></div>` : ""}
    <div class="two">
      <div class="stack">
        <h2 style="font-size:1.3rem">RSVPs</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Contact</th><th class="num">Party</th><th>Status</th><th>Check-in</th></tr></thead><tbody>
        ${rsvps.length ? rsvps.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.chip_in_cents ? `<br><span class="muted-s">Chipped in ${money(r.chip_in_cents)}</span>` : ""}</td><td>${r.email.endsWith("@walkin.local") ? `<span class="muted-s">Walk-in</span>` : esc(r.email)}${r.phone ? `<br><span class="muted-s">${esc(r.phone)}</span>` : ""}</td><td class="num">${r.party_size}</td><td>${pill(r.status)}</td>
          <td><button class="btn small ${r.checked_in_at ? "dark" : "ghost"} toggle-in" data-tok="${esc(r.token)}" data-in="${r.checked_in_at ? 1 : 0}">${r.checked_in_at ? "✓ Checked in" : "Check in"}</button></td></tr>`).join("") : `<tr><td colspan="5" class="muted">No RSVPs yet.</td></tr>`}
        </tbody></table></div>
        ${cancelled ? `<p class="muted-s">${cancelled} canceled RSVP${cancelled === 1 ? "" : "s"} not shown.</p>` : ""}
      </div>
      <div class="stack">
        <div class="card"><h2>Impact</h2>
          <p class="muted-s">Enter what the group made or did. These numbers go on the impact report and certificates.</p>
          <div id="items" class="stack" style="gap:8px">${(imp.items?.length ? imp.items : [{ label: "", count: "" }]).map(itemRow).join("")}</div>
          <div><button class="btn ghost small" type="button" id="add-item">Add another</button></div>
          <div class="field"><label for="i-partner">Partner charity</label><input id="i-partner" value="${esc(imp.partner)}" placeholder="North Texas Food Bank"></div>
          <div class="field"><label for="i-sum">Short story for the report</label><textarea id="i-sum" rows="3">${esc(imp.summary)}</textarea></div>
          <div class="field"><label for="i-photos">Photos</label><input id="i-photos" type="file" accept="image/*" multiple></div>
          <div class="thumbs" id="thumbs">${(imp.photos || []).map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div>
          <div class="row-actions"><button class="btn dark" type="button" id="save-impact">Save impact</button></div>
          ${can("manage") ? `<hr style="border:0;border-top:1px solid var(--line);width:100%">
          <h2>Impact report</h2>
          ${e.report_published_at ? `<p><span class="pill ok">Published</span></p><div class="copy-box"><code>${esc(location.origin + "/report/" + e.report_token)}</code><a class="btn small" href="/report/${esc(e.report_token)}" target="_blank" rel="noopener">Open</a></div>` : `<p class="muted-s">Publishing sends everyone who checked in a link to the report, their volunteer certificate and a feedback form.</p>`}
          <label class="check"><input type="checkbox" id="rep-notify" ${e.report_published_at ? "" : "checked"}> Email attendees${d.booking ? " and the organizer" : ""}</label>
          <div><button class="btn" type="button" id="publish-rep">${e.report_published_at ? "Republish report" : "Publish impact report"}</button></div>` : ""}
          <div id="imp-msg" aria-live="polite"></div>
        </div>
        <div class="card"><h2>Add a walk-in</h2>
          <form id="walkin" class="stack" style="gap:10px"><div class="form-row"><div class="field"><label for="w-name">Name</label><input id="w-name" name="name" required></div><div class="field"><label for="w-party">Party</label><input id="w-party" name="party_size" type="number" min="1" value="1"></div></div>
          <div class="field"><label for="w-email">Email (optional, for their certificate)</label><input id="w-email" name="email" type="email"></div><div><button class="btn small dark" type="submit">Add and check in</button></div></form>
        </div>
        ${d.feedback.length ? `<div class="card"><h2>Feedback</h2>${d.feedback.map((f) => `<div><b>${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</b> ${f.can_quote ? `<span class="pill ok">OK to quote</span>` : ""}<p style="margin:4px 0 0">${esc(f.comment || "")}</p><span class="muted-s">${esc(f.name || "Anonymous")}</span></div>`).join("<hr style='border:0;border-top:1px solid var(--line)'>")}</div>` : ""}
      </div>
    </div></div>`;
  wireEvent(e, d);
}
const itemRow = (it) => `<div class="impact-row"><div class="field"><label>Count</label><input type="number" min="0" class="i-count" value="${esc(it.count)}"></div><div class="field"><label>What</label><input class="i-label" value="${esc(it.label)}" placeholder="meals packed"></div><button class="btn ghost small" type="button" data-rm aria-label="Remove">✕</button></div>`;

function wireEvent(e, d) {
  document.querySelectorAll("[data-status]").forEach((b) => b.addEventListener("click", async () => { busy(b, true); await api(`/api/admin/events/${e.id}`, { method: "PATCH", body: { status: b.dataset.status } }); toast("Published"); eventView(e.id); }));
  $("#cancel-ev")?.addEventListener("click", () => { $("#cancel-box").hidden = false; });
  $("#cancel-no")?.addEventListener("click", () => { $("#cancel-box").hidden = true; });
  $("#cancel-yes")?.addEventListener("click", async (c) => { busy(c.target, true); await api(`/api/admin/events/${e.id}`, { method: "PATCH", body: { status: "cancelled", notify: $("#cancel-notify").checked } }); toast("Event canceled"); eventView(e.id); });
  document.querySelectorAll(".toggle-in").forEach((b) => b.addEventListener("click", async () => {
    busy(b, true, "…");
    try { await api("/api/admin/checkin", { method: "POST", body: { token: b.dataset.tok, undo: b.dataset.in === "1" } }); eventView(e.id); }
    catch (err) { toast(err.message); busy(b, false); }
  }));
  $("#add-item").addEventListener("click", () => $("#items").insertAdjacentHTML("beforeend", itemRow({ label: "", count: "" })));
  $("#items").addEventListener("click", (c) => { if (c.target.closest("[data-rm]")) c.target.closest(".impact-row").remove(); });
  $("#save-impact").addEventListener("click", async (c) => {
    busy(c.target, true, "Saving…");
    const items = [...document.querySelectorAll(".impact-row")].map((r) => ({ label: r.querySelector(".i-label").value.trim(), count: Number(r.querySelector(".i-count").value) || 0 })).filter((i) => i.label);
    try { await api(`/api/admin/events/${e.id}`, { method: "PATCH", body: { impact: { items, partner: $("#i-partner").value.trim(), summary: $("#i-sum").value.trim() } } }); toast("Impact saved"); }
    catch (err) { $("#imp-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
    busy(c.target, false);
  });
  $("#i-photos").addEventListener("change", async (c) => {
    const files = [...c.target.files];
    for (const [i, file] of files.entries()) {
      $("#imp-msg").innerHTML = `<div class="alert">Uploading photo ${i + 1} of ${files.length}…</div>`;
      try {
        const { data, type } = await shrink(file);
        const r = await api(`/api/admin/events/${e.id}/photos`, { method: "POST", body: { filename: file.name.replace(/\.[^.]+$/, ""), content_type: type, data_base64: data } });
        $("#thumbs").innerHTML = r.photos.map((p) => `<img src="${esc(p)}" alt="">`).join("");
      } catch (err) { $("#imp-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; return; }
    }
    $("#imp-msg").innerHTML = `<div class="alert success">Photos added.</div>`; c.target.value = "";
  });
  $("#publish-rep")?.addEventListener("click", async (c) => {
    busy(c.target, true, "Publishing…");
    try { const r = await api(`/api/admin/events/${e.id}/publish-report`, { method: "POST", body: { notify: $("#rep-notify").checked } }); toast(r.sent ? `Report published and sent to ${r.sent}` : "Report published"); eventView(e.id); }
    catch (err) { $("#imp-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; busy(c.target, false); }
  });
  $("#walkin").addEventListener("submit", async (w) => {
    w.preventDefault();
    const f = Object.fromEntries(new FormData(w.target).entries());
    try { await api(`/api/admin/events/${e.id}/rsvps`, { method: "POST", body: { ...f, party_size: Number(f.party_size) || 1 } }); toast(`${f.name} checked in`); eventView(e.id); }
    catch (err) { toast(err.message); }
  });
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copied"); } catch {} }));
  document.querySelectorAll("[data-download]").forEach((a) => a.addEventListener("click", async (c) => {
    c.preventDefault();
    const res = await fetch(a.getAttribute("href"), { headers: { authorization: `Bearer ${token}` } });
    const url = URL.createObjectURL(await res.blob());
    const l = document.createElement("a"); l.href = url; l.download = `${e.slug}-rsvps.csv`; document.body.append(l); l.click(); l.remove(); URL.revokeObjectURL(url);
  }));
}

/** Resize a photo in the browser to at most 1600px so uploads stay small and fast. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve({ data: c.toDataURL("image/jpeg", 0.85).split(",")[1], type: "image/jpeg" });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("That file isn't a photo we can read."));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- Check-in mode ---------------- */
async function checkinView(id) {
  const d = await api(`/api/admin/events/${id}`);
  let rsvps = d.rsvps.filter((r) => r.status !== "cancelled");
  view.innerHTML = `<div class="stack-lg" style="max-width:760px">
    <div class="row-actions"><a href="#event-${id}">← Back to event</a></div>
    <h1>Check-in: ${esc(d.event.title)}</h1>
    <div class="adm-grid"><div class="kpi"><b id="ci-count">0</b><span>checked in</span></div><div class="kpi"><b>${rsvps.length}</b><span>RSVPs</span></div></div>
    <div class="row-actions"><button class="btn" type="button" id="scan-btn">Scan a QR code</button></div>
    <div class="scanner" id="scanner" hidden><video id="cam" playsinline muted></video><div class="row-actions" style="margin-top:8px"><button class="btn ghost small" id="scan-stop" type="button">Stop scanning</button></div></div>
    <div id="scan-msg" aria-live="assertive"></div>
    <div class="field"><label for="ci-search">Find someone</label><input id="ci-search" class="big-search" placeholder="Type a name or email" autocomplete="off"></div>
    <div class="table-wrap"><table class="table"><tbody id="ci-list"></tbody></table></div>
  </div>`;
  const draw = () => {
    const q = $("#ci-search").value.trim().toLowerCase();
    $("#ci-count").textContent = rsvps.filter((r) => r.checked_in_at).length;
    $("#ci-list").innerHTML = rsvps.filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      .map((r) => `<tr><td><b>${esc(r.name)}</b>${r.party_size > 1 ? ` <span class="muted-s">+${r.party_size - 1}</span>` : ""}${r.status === "waitlist" ? " " + pill("waitlist") : ""}</td><td style="text-align:right"><button class="btn ${r.checked_in_at ? "dark" : ""} toggle-in" data-tok="${esc(r.token)}" data-in="${r.checked_in_at ? 1 : 0}">${r.checked_in_at ? "✓ Checked in" : "Check in"}</button></td></tr>`).join("")
      || `<tr><td class="muted">No one matches. Add them as a walk-in from the event page.</td></tr>`;
  };
  const doCheck = async (tok, undo) => {
    const r = await api("/api/admin/checkin", { method: "POST", body: { token: tok, undo } });
    rsvps = rsvps.map((x) => (x.id === r.rsvp.id ? r.rsvp : x));
    draw();
    return r.rsvp;
  };
  $("#ci-search").addEventListener("input", draw);
  $("#ci-list").addEventListener("click", async (c) => {
    const b = c.target.closest(".toggle-in"); if (!b) return;
    busy(b, true, "…");
    try { await doCheck(b.dataset.tok, b.dataset.in === "1"); } catch (err) { toast(err.message); busy(b, false); }
  });
  let stream = null, raf = 0, last = "";
  const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; $("#scanner").hidden = true; };
  $("#scan-stop").addEventListener("click", stop);
  $("#scan-btn").addEventListener("click", async () => {
    if (!window.jsQR) { toast("Scanner is still loading. Try again in a moment."); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); }
    catch { $("#scan-msg").innerHTML = `<div class="alert error">We couldn't open the camera. Allow camera access, or search by name instead.</div>`; return; }
    $("#scanner").hidden = false;
    const v = $("#cam"); v.srcObject = stream; await v.play();
    const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true });
    const tick = async () => {
      if (!stream) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth; c.height = v.videoHeight; ctx.drawImage(v, 0, 0);
        const code = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (code && code.data && code.data !== last) {
          last = code.data;
          try { const r = await doCheck(code.data.split("/").pop(), false); $("#scan-msg").innerHTML = `<div class="alert success">✓ ${esc(r.name)} is checked in${r.party_size > 1 ? ` (party of ${r.party_size})` : ""}.</div>`; if (navigator.vibrate) navigator.vibrate(80); }
          catch (err) { $("#scan-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
          setTimeout(() => (last = ""), 2500);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  });
  window.addEventListener("hashchange", stop, { once: true });
  draw();
}

/* ---------------- Bookings ---------------- */
async function bookingsView() {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const { bookings } = await api("/api/admin/bookings");
  view.innerHTML = `<div class="stack-lg"><div class="row-actions" style="justify-content:space-between"><h1>Bookings</h1><a class="btn ghost small" href="/plan" target="_blank" rel="noopener">Open the planner</a></div>
    ${bookings.length ? bookingTable(bookings) : `<div class="card"><p>No booking requests yet. Companies book from the planner at <a href="/plan">thatsjustgood.com/plan</a>.</p></div>`}</div>`;
  wireRows();
}

async function bookingView(id) {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const { booking: b, team_url, organizer_url } = await api(`/api/admin/bookings/${id}`);
  const open = ["requested", "quoted", "deposit_pending"].includes(b.status);
  view.innerHTML = `<div class="stack-lg">
    <div class="row-actions"><a href="#bookings">← All bookings</a></div>
    <div class="stack" style="gap:8px"><div class="row-actions">${pill(b.status)}<span class="pill">${esc(b.ref)}</span></div><h1>${esc(b.org_name)}</h1>
      <p class="muted">${esc(b.contact_name)} · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.phone ? ` · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ""}</p></div>
    <div class="two">
      <div class="card"><h2>Request</h2>
        <div class="facts" style="border-top-width:1px">
          <div><span class="k">Format</span><span class="v">${b.format === "host_only" ? "Host Only" : "All-Inclusive"}</span></div>
          <div><span class="k">Cause</span><span class="v">${esc(b.cause)}</span></div>
          <div><span class="k">People</span><span class="v">${b.group_size}</span></div>
          <div><span class="k">Length</span><span class="v">${b.duration_min} minutes</span></div>
          <div><span class="k">Date</span><span class="v">${esc(b.preferred_date)} at ${esc(b.start_time || "TBD")}${b.alt_date ? `<br><span class="muted-s">Backup: ${esc(b.alt_date)}</span>` : ""}</span></div>
          <div><span class="k">Location</span><span class="v">${esc(b.location_type || "")}${b.address ? `<br>${esc(b.address)}` : ""}</span></div>
          <div><span class="k">Notes</span><span class="v">${esc(b.notes || "None")}</span></div>
          <div><span class="k">Price</span><span class="v">${b.total_cents ? money(b.total_cents) : "Not set"}${b.deposit_cents ? `<br><span class="muted-s">Deposit ${money(b.deposit_cents)}${b.deposit_paid_at ? " · paid" : ""}</span>` : ""}${b.balance_invoice_url ? `<br><a href="${esc(b.balance_invoice_url)}" target="_blank" rel="noopener">Balance invoice</a>${b.balance_paid_at ? " · paid" : ""}` : ""}</span></div>
        </div>
      </div>
      <div class="stack">
        ${open && can("manage") ? `<div class="card"><h2>Send a quote</h2><p class="muted-s">Set the total. We email the client a link to pay the ${50}% deposit, which confirms their date automatically.</p>
          <form id="quote" class="row-actions"><div class="field" style="flex:1;min-width:140px"><label for="q-total">Total price ($)</label><input id="q-total" type="number" min="1" step="1" value="${b.total_cents ? b.total_cents / 100 : ""}" required></div><button class="btn" type="submit" style="align-self:end">${b.status === "requested" ? "Send quote and deposit link" : "Update and resend"}</button></form>
          <hr style="border:0;border-top:1px solid var(--line);width:100%"><h2>Or confirm now</h2><p class="muted-s">For clients paying by invoice or check. Creates their event and team RSVP link, and emails them.</p>
          <div class="row-actions"><button class="btn dark small" id="confirm" type="button">Confirm without deposit</button><button class="btn ghost small" id="confirm-paid" type="button">Deposit was paid another way</button></div></div>` : ""}
        ${team_url ? `<div class="card"><h2>Links</h2><p class="muted-s">Team RSVP page</p><div class="copy-box"><code>${esc(team_url)}</code><button class="btn small dark" data-copy="${esc(team_url)}">Copy</button></div>
          <p class="muted-s">Organizer page</p><div class="copy-box"><code>${esc(organizer_url)}</code><button class="btn small" data-copy="${esc(organizer_url)}">Copy</button></div>
          ${b.event_id ? `<div><a class="btn small" href="#event-${b.event_id}">Open the event</a></div>` : ""}</div>` : ""}
        <div class="card"><h2>Private notes</h2><textarea id="notes" rows="4" ${can("manage") ? "" : "disabled"}>${esc(b.admin_notes || "")}</textarea>${can("manage") ? `<div class="row-actions"><button class="btn ghost small" id="save-notes" type="button">Save notes</button>${open ? `<button class="btn ghost small" id="cancel-b" type="button">Mark as canceled</button>` : ""}</div>` : ""}</div>
        <div id="b-msg" aria-live="polite"></div>
      </div>
    </div></div>`;
  const msg = (m, k = "") => ($("#b-msg").innerHTML = `<div class="alert ${k}">${esc(m)}</div>`);
  $("#quote")?.addEventListener("submit", async (s) => {
    s.preventDefault(); const btn = s.target.querySelector("button"); busy(btn, true, "Sending…");
    try { await api(`/api/admin/bookings/${id}/quote`, { method: "POST", body: { total_cents: Math.round(Number($("#q-total").value) * 100) } }); toast("Quote sent"); bookingView(id); }
    catch (err) { msg(err.message, "error"); busy(btn, false); }
  });
  const confirm = async (paid, btn) => { busy(btn, true, "Confirming…"); try { await api(`/api/admin/bookings/${id}/confirm`, { method: "POST", body: { deposit_paid: paid } }); toast("Booking confirmed"); bookingView(id); } catch (err) { msg(err.message, "error"); busy(btn, false); } };
  $("#confirm")?.addEventListener("click", (c) => confirm(false, c.target));
  $("#confirm-paid")?.addEventListener("click", (c) => confirm(true, c.target));
  $("#save-notes")?.addEventListener("click", async () => { await api(`/api/admin/bookings/${id}`, { method: "PATCH", body: { admin_notes: $("#notes").value } }); toast("Notes saved"); });
  $("#cancel-b")?.addEventListener("click", async () => { await api(`/api/admin/bookings/${id}`, { method: "PATCH", body: { status: "cancelled" } }); toast("Marked canceled"); bookingView(id); });
  document.querySelectorAll("[data-copy]").forEach((b2) => b2.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b2.dataset.copy); toast("Copied"); } catch {} }));
}

/* ---------------- Team ---------------- */
async function teamView() {
  view.innerHTML = `<p class="app-loading">Loading…</p>`;
  const { team } = await api("/api/admin/team");
  view.innerHTML = `<div class="stack-lg" style="max-width:820px"><h1>Team</h1>
    <div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
    <tr><td>${esc(me.email)} <span class="muted-s">(you)</span></td><td>${esc(me.role)}</td><td></td></tr>
    ${team.filter((t) => t.user_id !== me.user_id).map((t) => `<tr><td>${esc(t.email)}</td><td>${esc(t.role)}</td><td style="text-align:right">${can("team") ? `<button class="btn ghost small" data-rm="${esc(t.user_id)}">Remove</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    ${can("team") ? `<form class="card" id="invite"><h2>Add a team member</h2>
      <div class="form-row"><div class="field"><label for="t-email">Email</label><input id="t-email" type="email" required></div>
      <div class="field"><label for="t-role">Role</label><select id="t-role"><option value="staff">Staff: check-in and impact numbers</option><option value="admin">Admin: events and bookings</option><option value="owner">Owner: everything, including the team</option></select></div></div>
      <div><button class="btn" type="submit">Send invite</button></div><div id="t-msg" aria-live="polite"></div></form>` : `<p class="muted">Only owners can add or remove team members.</p>`}</div>`;
  $("#invite")?.addEventListener("submit", async (s) => {
    s.preventDefault(); const btn = s.target.querySelector("button"); busy(btn, true, "Inviting…");
    try { await api("/api/admin/team", { method: "POST", body: { email: $("#t-email").value, role: $("#t-role").value } }); toast("Invite sent"); teamView(); }
    catch (err) { $("#t-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; busy(btn, false); }
  });
  document.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => { await api(`/api/admin/team/${b.dataset.rm}`, { method: "DELETE" }); toast("Removed"); teamView(); }));
}

boot();
