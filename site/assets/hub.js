// My Impact Hub app (hub.thatsjustgood.com). One page; screens are drawn from the API.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $("#app");
const BASE = location.hostname.startsWith("hub.") ? "" : "/hub";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hrs = (n) => { const v = Math.round(Number(n || 0) * 100) / 100; return `${v.toLocaleString("en-US")} ${v === 1 ? "hour" : "hours"}`; };
const dateNice = (d) => new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const href = (p) => BASE + (p.startsWith("/") ? p : "/" + p);
const toast = (m) => { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2800); };
const busy = (b, on, label) => { if (!b) return; b.disabled = on; if (on) { b.dataset.l = b.textContent; b.textContent = label || "Working…"; } else if (b.dataset.l) b.textContent = b.dataset.l; };
const pct = (a, b) => (b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
const STATUS = {
  verified: `<span class="pill ok">Confirmed</span>`, awaiting_supervisor: `<span class="pill warn">Waiting on supervisor</span>`,
  unverified: `<span class="pill">Not confirmed</span>`, declined: `<span class="pill hot">Declined</span>`,
};
const approvalPill = (e) => (e.approval === "approved" ? `<span class="pill ok">Approved</span>` : e.approval === "returned" ? `<span class="pill hot">Sent back</span>` : e.group_id ? `<span class="pill">Waiting on leader</span>` : "");
const KINDS = { club: "Club", chapter: "Chapter", school: "School", company: "Company", nonprofit: "Nonprofit", faith: "Faith group", team: "Team", other: "Other" };
const badgeEl = (b, size = "") => `<span class="badge ${{ spark: "", shine: "shine", glow: "glow", legend: "legend", cause: "cause", streak: "streak", day: "day" }[b.tier] ?? ""}" aria-hidden="true" ${size}>${esc(b.label)}</span>`;

let sb = null, token = null, cfg = null, me = null, homeCache = null;

/* ---------------- API ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (res.status === 401 && token) { await signOut(true); render(); throw new Error("Please sign in again."); }
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status });
  return data;
}

/* ---------------- Sign-in ---------------- */
async function boot() {
  cfg = await fetch("/api/config").then((r) => r.json()).catch(() => ({ mode: "dev" }));
  if (cfg.mode === "live" && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, storageKey: "tjg-hub" } });
    const { data } = await sb.auth.getSession();
    token = data.session?.access_token || null;
    sb.auth.onAuthStateChange((_e, s) => { const had = token; token = s?.access_token || null; if (!had && token) render(); });
  } else {
    try { token = localStorage.getItem("tjg-hub-dev"); } catch {}
  }
  $$("[data-tab]").forEach((a) => { a.href = href(a.dataset.tab === "home" ? "/" : "/" + a.dataset.tab); });
  $$(".hub-brand").forEach((a) => { a.href = href("/"); });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute("download")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE + "/") && u.pathname !== BASE && BASE) return;
    if (!BASE && (u.pathname.startsWith("/api/") || u.pathname.startsWith("/assets/"))) return;
    e.preventDefault();
    go(u.pathname + u.search);
  });
  window.addEventListener("popstate", render);
  render();
}
function go(path) { history.pushState(null, "", path.startsWith(BASE) ? path : href(path)); render(); }
async function signOut(silent) {
  try { if (sb) await sb.auth.signOut(); localStorage.removeItem("tjg-hub-dev"); } catch {}
  token = null; me = null; homeCache = null;
  if (!silent) go("/");
}

function chrome(signedIn) {
  $("#hub-nav").hidden = !signedIn; $("#hub-tabbar").hidden = !signedIn;
  $("#hub-account").innerHTML = signedIn ? `<button class="btn ghost small" type="button" id="so">Sign out</button>` : "";
  $("#so")?.addEventListener("click", () => signOut());
}
function mark(tab) { $$("[data-tab]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.tab === tab)); $$("[data-tab][aria-current]").forEach((a) => a.setAttribute("aria-current", "page")); }

function signinView(next) {
  chrome(false);
  const live = sb != null;
  if (!live && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    app.innerHTML = `<div class="signin card"><span class="pill sky">Coming soon</span><h1>My Impact Hub is almost ready</h1><p class="muted">We're putting the finishing touches on it. Join the waitlist and we'll invite you as soon as it opens.</p><div><a class="btn" href="https://thatsjustgood.com/impact-hub#waitlist">Join the waitlist</a></div></div>`;
    return;
  }
  app.innerHTML = `<div class="signin card">
    <h1>Sign in to My Impact Hub</h1>
    <p class="muted">${live ? "Enter your email and we'll send you a link to sign in. New here? The same link creates your free account." : "Test mode: the Hub isn't connected to its database yet, so anything you add is temporary."}</p>
    <form id="si" class="stack" style="gap:14px">
      <div class="field"><label for="si-email">Email</label><input id="si-email" type="email" required autocomplete="email" inputmode="email"></div>
      <div><button class="btn" type="submit">${live ? "Email me a sign-in link" : "Continue"}</button></div>
      <div id="si-msg" aria-live="polite"></div>
    </form>
    <p class="muted" style="font-size:.92rem">Tip: use your personal email so your record stays with you after you graduate or change jobs. You can join your school or company groups either way.</p>
  </div>`;
  $("#si").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#si-email").value.trim();
    if (!live) { token = `dev-member:${email.toLowerCase()}`; try { localStorage.setItem("tjg-hub-dev", token); } catch {} return render(); }
    const b = e.target.querySelector("button"); busy(b, true, "Sending…");
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + (next || href("/")), shouldCreateUser: true } });
    busy(b, false);
    $("#si-msg").innerHTML = error ? `<div class="alert error">${esc(error.message)}</div>` : `<div class="alert success">Check your inbox for your sign-in link. You can close this tab.</div>`;
  });
}

function setupView(email) {
  chrome(false);
  app.innerHTML = `<div class="signin card">
    <h1>Welcome to My Impact Hub</h1>
    <p class="muted">Set up your free profile. It takes 20 seconds.</p>
    <form id="pf" class="stack" style="gap:14px">
      <div class="field"><label for="pf-name">Your name</label><input id="pf-name" required autocomplete="name"></div>
      <div class="field"><label for="pf-grad">Graduation year <span class="muted">(students, optional)</span></label><input id="pf-grad" inputmode="numeric" placeholder="2028"></div>
      <label class="check"><input type="checkbox" id="pf-age" required><span>I'm 13 or older. Younger students can join through their school.</span></label>
      <div><button class="btn" type="submit">Create my profile</button></div>
      <div id="pf-msg" aria-live="polite"></div>
    </form>
    <p class="muted" style="font-size:.9rem">Signed in as ${esc(email)}. We never sell your data or show ads.</p>
  </div>`;
  $("#pf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("button"); busy(b, true, "Saving…");
    try {
      await api("/api/hub/me", { method: "POST", body: { name: $("#pf-name").value, grad_year: $("#pf-grad").value || null, age_ok: $("#pf-age").checked } });
      const pending = sessionStorage.getItem("tjg-hub-join"); sessionStorage.removeItem("tjg-hub-join");
      if (pending) return go(`/join/${pending}`);
      go("/");
    } catch (err) { busy(b, false); $("#pf-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}

/* ---------------- Router ---------------- */
async function render() {
  const path = (location.pathname.slice(BASE.length) || "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  try {
    // Public screens: no sign-in needed
    if (parts[0] === "confirm") return await confirmView(parts[1]);
    if (parts[0] === "verify") return await verifyView(parts[1]);
    if (!token) { if (parts[0] === "join") sessionStorage.setItem("tjg-hub-join", parts[1]); return signinView(location.pathname); }
    if (!me) {
      const r = await api("/api/hub/me");
      if (!r.profile) { if (parts[0] === "join") sessionStorage.setItem("tjg-hub-join", parts[1]); return setupView(r.email); }
      me = r.profile;
    }
    chrome(true);
    app.innerHTML = `<p class="app-loading">Loading…</p>`;
    const [a, b, c] = parts;
    if (!a) { mark("home"); return await homeView(); }
    if (a === "log") { mark("log"); return await logView(); }
    if (a === "hours") { mark("hours"); return await hoursView(); }
    if (a === "badges") { mark("badges"); return await badgesView(); }
    if (a === "groups" && !b) { mark("groups"); return await groupsView(); }
    if (a === "groups" && b) { mark("groups"); return await groupView(b, c || "overview"); }
    if (a === "join") { mark("groups"); return await joinView(b); }
    if (a === "transcripts") { mark("transcripts"); return await transcriptsView(); }
    app.innerHTML = `<div class="card"><h1>Page not found</h1><a class="btn" href="${href("/")}">Go home</a></div>`;
  } catch (e) {
    app.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
  }
}

/* ---------------- Home ---------------- */
async function homeView() {
  const h = homeCache = await api("/api/hub/home");
  const first = esc(h.profile.name.split(" ")[0]);
  app.innerHTML = `<div class="stack-lg">
    <div class="row between"><h1>Hi ${first}</h1><a class="btn" href="${href("/log")}">Log hours</a></div>
    <div class="kpis">
      <div class="kpi"><b>${esc(h.totals.verified)}</b><span>verified hours</span></div>
      <div class="kpi"><b>${esc(h.totals.pending)}</b><span>hours waiting on confirmation</span></div>
      <div class="kpi"><b>${esc(h.badges.count)}</b><span>badges earned</span></div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="card">
          <div class="row between"><h2>My groups</h2><a class="btn ghost small" href="${href("/groups")}">Join or create</a></div>
          ${h.groups.length ? `<div class="list">${h.groups.map((g) => `<a class="rowlink" href="${href("/groups/" + g.id)}" style="display:grid;gap:8px">
            <div class="row between"><b>${esc(g.name)}</b>${g.to_review ? `<span class="pill hot">${g.to_review} to review</span>` : g.role === "leader" ? `<span class="pill sky">Leader</span>` : ""}</div>
            ${g.goal_hours ? `<div class="bar"><i style="width:${pct(g.group_hours, g.goal_hours)}%"></i></div><span class="meta">${esc(g.group_hours)} of ${esc(g.goal_hours)} group hours${g.goal_label ? " · " + esc(g.goal_label) : ""}</span>` : `<span class="meta">${hrs(g.group_hours)} approved for the group</span>`}
            ${g.per_member_hours ? `<span class="meta">You: ${esc(g.my_hours)} of ${esc(g.per_member_hours)} required hours</span>` : ""}
          </a>`).join("")}</div>` : `<p class="muted">You're not in a group yet. Got a join code from your club, school or company? Add it under Groups.</p>`}
        </div>
        <div class="card">
          <div class="row between"><h2>Recent hours</h2><a class="btn ghost small" href="${href("/hours")}">See all</a></div>
          ${h.recent.length ? `<div class="list">${h.recent.map(entryRow).join("")}</div>` : `<div class="empty"><p>Nothing logged yet.</p><a class="btn small" href="${href("/log")}">Log your first hours</a></div>`}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="row between"><h2>Badges</h2><a class="btn ghost small" href="${href("/badges")}">All badges</a></div>
          ${h.badges.earned.length ? `<div class="badge-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${h.badges.earned.map((b) => `<div style="display:grid;justify-items:center;gap:6px;text-align:center">${badgeEl(b)}<small>${esc(b.name)}</small></div>`).join("")}</div>` : `<p class="muted">Your first badge comes with your first verified hour.</p>`}
          ${h.badges.next.length ? `<div class="stack" style="gap:10px"><b>Almost there</b>${h.badges.next.map((b) => `<div style="display:grid;gap:6px"><div class="row between"><span>${esc(b.name)}</span><span class="meta">${pct(b.progress, 1)}%</span></div><div class="bar"><i style="width:${pct(b.progress, 1)}%"></i></div></div>`).join("")}</div>` : ""}
        </div>
        <div class="card">
          <h2>Verified transcript</h2>
          ${h.transcripts.ok ? `<p class="muted">Included through ${esc(h.transcripts.via)}. Create a transcript with a check code for college, scholarships and NHS.</p><div><a class="btn small" href="${href("/transcripts")}">My transcripts</a></div>`
            : `<p class="muted">Verified transcripts come with the Verified Student plan ($39 a year) or when your group is on a paid plan.</p>`}
        </div>
      </div>
    </div>
  </div>`;
}
const entryRow = (e) => `<div style="display:grid;gap:4px;justify-content:stretch">
  <div class="row between"><b>${esc(e.activity)}</b><span>${hrs(e.hours)}</span></div>
  <div class="row between"><span class="meta">${esc(dateNice(e.date))}${e.org_name ? " · " + esc(e.org_name) : ""}</span><span class="row" style="gap:6px">${STATUS[e.status] || ""}${approvalPill(e)}</span></div>
  ${e.approval === "returned" && e.return_note ? `<span class="meta">Leader note: ${esc(e.return_note)}</span>` : ""}
</div>`;

/* ---------------- Log hours ---------------- */
async function logView() {
  const h = homeCache || await api("/api/hub/home");
  const params = new URLSearchParams(location.search);
  app.innerHTML = `<div class="stack-lg" style="max-width:760px">
    <h1>Log hours</h1>
    ${h.recentActivities.length ? `<div class="card"><b>Do it again</b><p class="muted" style="margin-top:-6px">Tap something you've logged before to fill in the details.</p><div class="row">${h.recentActivities.map((r, i) => `<button class="btn ghost small" type="button" data-again="${i}">${esc(r.activity)}</button>`).join("")}</div></div>` : ""}
    <form id="lf" class="card" novalidate>
      <div class="field"><label for="lf-act">What did you do?</label><input id="lf-act" name="activity" required maxlength="140" placeholder="Sorted food at the food bank"></div>
      <div class="form-row">
        <div class="field"><label for="lf-org">Organization</label><input id="lf-org" name="org_name" maxlength="140" placeholder="Community Food Bank"></div>
        <div class="field"><label for="lf-cause">Cause</label><select id="lf-cause" name="cause"><option value="">Choose one</option>${h.causes.map((c) => `<option value="${c.code}">${esc(c.label)}</option>`).join("")}</select></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="lf-date">Date</label><input id="lf-date" name="date" type="date" required max="${today()}" value="${today()}"></div>
        <div class="field"><label for="lf-hours">Hours</label><input id="lf-hours" name="hours" type="number" inputmode="decimal" min="0.25" max="24" step="0.25" required placeholder="2"></div>
      </div>
      ${h.groups.length ? `<div class="field"><label for="lf-group">Count it toward a group</label><select id="lf-group" name="group_id"><option value="">Just for me</option>${h.groups.map((g) => `<option value="${g.id}" ${params.get("group") === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>` : ""}
      <fieldset class="stack" style="border:0;padding:0;margin:0;gap:10px">
        <legend style="font-weight:700;padding:0;margin-bottom:6px">Who can confirm it?</legend>
        <p class="muted" style="font-size:.95rem">We'll email them one link to confirm. Confirmed hours count toward badges and transcripts.</p>
        <div class="form-row">
          <div class="field"><label for="lf-sn">Supervisor's name</label><input id="lf-sn" name="supervisor_name" maxlength="120" autocomplete="off"></div>
          <div class="field"><label for="lf-se">Supervisor's email</label><input id="lf-se" name="supervisor_email" type="email" inputmode="email" maxlength="160" autocomplete="off"></div>
        </div>
      </fieldset>
      <div class="field"><label for="lf-ref">What did you learn or notice? <span class="muted">(optional)</span></label><textarea id="lf-ref" name="reflection" rows="3" maxlength="2000"></textarea></div>
      <div class="field"><label for="lf-photo">Add a photo <span class="muted">(optional)</span></label><input id="lf-photo" type="file" accept="image/*"></div>
      <label class="check"><input type="checkbox" id="lf-honor" name="honor"><span>I confirm these hours are true and accurate.</span></label>
      <div><button class="btn" type="submit">Save hours</button></div>
      <div id="lf-msg" aria-live="polite"></div>
    </form>
  </div>`;
  const f = $("#lf");
  $$("[data-again]").forEach((b) => b.addEventListener("click", () => {
    const r = h.recentActivities[Number(b.dataset.again)];
    f.activity.value = r.activity || ""; f.org_name.value = r.org_name || ""; f.cause.value = r.cause || "";
    f.supervisor_name.value = r.supervisor_name || ""; f.supervisor_email.value = r.supervisor_email || ""; f.hours.value = r.hours || "";
    if (f.group_id && r.group_id) f.group_id.value = r.group_id;
    f.date.focus();
  }));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = f.querySelector("button[type=submit]"); busy(b, true, "Saving…");
    const data = Object.fromEntries(new FormData(f)); data.honor = $("#lf-honor").checked;
    try {
      const { entry } = await api("/api/hub/entries", { method: "POST", body: data });
      const file = $("#lf-photo").files[0];
      if (file) { try { await api(`/api/hub/entries/${entry.id}/photo`, { method: "POST", body: await photoPayload(file) }); } catch (err) { toast("Hours saved, but the photo didn't upload."); } }
      homeCache = null;
      toast(entry.status === "awaiting_supervisor" ? "Saved. We emailed your supervisor to confirm." : "Saved.");
      go("/hours");
    } catch (err) { busy(b, false); $("#lf-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}
async function photoPayload(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return { content_type: "image/jpeg", data_base64: url.split(",")[1] };
}

/* ---------------- My hours ---------------- */
async function hoursView() {
  const { entries } = await api("/api/hub/entries");
  app.innerHTML = `<div class="stack-lg">
    <div class="row between"><h1>My hours</h1><a class="btn" href="${href("/log")}">Log hours</a></div>
    <div class="card">${entries.length ? `<div class="list">${entries.map((e) => `<div style="display:grid;gap:8px">${entryRow(e)}
      <div class="row" style="gap:8px">
        ${e.status === "awaiting_supervisor" ? `<button class="btn ghost small" type="button" data-resend="${e.id}">Resend to supervisor</button>` : ""}
        ${e.approval !== "approved" ? `<button class="btn ghost small" type="button" data-del="${e.id}">Delete</button>` : ""}
        ${e.photo_url ? `<a class="btn ghost small" href="${esc(e.photo_url)}" target="_blank" rel="noopener">Photo</a>` : ""}
      </div></div>`).join("")}</div>` : `<div class="empty"><p>No hours yet.</p><a class="btn small" href="${href("/log")}">Log your first hours</a></div>`}</div>
  </div>`;
  $$("[data-resend]").forEach((b) => b.addEventListener("click", async () => { busy(b, true, "Sending…"); try { await api(`/api/hub/entries/${b.dataset.resend}/resend`, { method: "POST" }); toast("Sent again."); } catch (e) { toast(e.message); } busy(b, false); }));
  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap again to delete"; return; }
    try { await api(`/api/hub/entries/${b.dataset.del}`, { method: "DELETE" }); homeCache = null; hoursView(); } catch (e) { toast(e.message); }
  }));
}

/* ---------------- Badges ---------------- */
async function badgesView() {
  const r = await api("/api/hub/badges");
  const groups = [...new Set(r.badges.map((b) => b.group))];
  app.innerHTML = `<div class="stack-lg">
    <div><h1>Badges</h1><p class="muted">${r.earnedCount} earned. Badges count confirmed or approved hours, never how much you give.</p></div>
    ${groups.map((g) => `<section class="stack"><h2>${esc(g)}</h2><div class="badge-grid">${r.badges.filter((b) => b.group === g).map((b) => `<div class="badge-card ${b.earned ? "" : "locked"}">
      ${badgeEl(b)}<b>${esc(b.name)}</b>${b.stars ? `<span class="stars" aria-label="${b.stars} stars">${"★".repeat(b.stars)}</span>` : ""}<small>${esc(b.how)}</small>
      ${!b.earned && b.progress > 0 ? `<div class="bar" style="width:100%"><i style="width:${pct(b.progress, 1)}%"></i></div>` : ""}
    </div>`).join("")}</div></section>`).join("")}
  </div>`;
}

/* ---------------- Groups ---------------- */
async function groupsView() {
  const h = homeCache = await api("/api/hub/home");
  app.innerHTML = `<div class="stack-lg">
    <h1>Groups</h1>
    <div class="grid2">
      <div class="card">
        <h2>My groups</h2>
        ${h.groups.length ? `<div class="list">${h.groups.map((g) => `<a class="rowlink" href="${href("/groups/" + g.id)}"><span><b>${esc(g.name)}</b><br><span class="meta">${esc(KINDS[g.kind] || "")}${g.role === "leader" ? " · Leader" : ""}</span></span><span>${hrs(g.group_hours)}</span></a>`).join("")}</div>` : `<p class="muted">No groups yet.</p>`}
      </div>
      <div class="stack">
        <form id="jf" class="card"><h2>Join a group</h2><div class="field"><label for="jf-code">Join code</label><input id="jf-code" required maxlength="10" autocapitalize="characters" placeholder="ABC123" style="text-transform:uppercase"></div><div><button class="btn" type="submit">Join</button></div><div id="jf-msg" aria-live="polite"></div></form>
        <form id="cf" class="card"><h2>Start a group</h2><p class="muted" style="margin-top:-6px">Free for up to 25 members.</p>
          <div class="field"><label for="cf-name">Group name</label><input id="cf-name" required maxlength="120" placeholder="Lincoln High NHS"></div>
          <div class="form-row"><div class="field"><label for="cf-kind">Type</label><select id="cf-kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div class="field"><label for="cf-goal">Group hour goal <span class="muted">(optional)</span></label><input id="cf-goal" type="number" inputmode="numeric" min="1"></div></div>
          <div><button class="btn dark" type="submit">Create group</button></div><div id="cf-msg" aria-live="polite"></div></form>
      </div>
    </div>
  </div>`;
  $("#jf").addEventListener("submit", (e) => { e.preventDefault(); go(`/join/${$("#jf-code").value.trim().toUpperCase()}`); });
  $("#cf").addEventListener("submit", async (e) => {
    e.preventDefault(); const b = e.target.querySelector("button"); busy(b, true, "Creating…");
    try { const { group } = await api("/api/hub/groups", { method: "POST", body: { name: $("#cf-name").value, kind: $("#cf-kind").value, goal_hours: $("#cf-goal").value || null } }); homeCache = null; go(`/groups/${group.id}/share`); }
    catch (err) { busy(b, false); $("#cf-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}

async function joinView(code) {
  const info = await api(`/api/hub/join/${encodeURIComponent(code)}`);
  app.innerHTML = `<div class="signin card"><h1>Join ${esc(info.group.name)}</h1><p class="muted">${esc(KINDS[info.group.kind] || "Group")} · ${info.group.members} member${info.group.members === 1 ? "" : "s"}</p><p>Your hours logged for this group go to its leaders for approval. Your personal record stays yours.</p><div class="row"><button class="btn" id="jn" type="button">Join group</button><a class="btn ghost" href="${href("/groups")}">Not now</a></div><div id="jn-msg" aria-live="polite"></div></div>`;
  $("#jn").addEventListener("click", async (e) => {
    busy(e.target, true, "Joining…");
    try { const r = await api(`/api/hub/join/${encodeURIComponent(code)}`, { method: "POST" }); homeCache = null; toast("You're in."); go(`/groups/${r.group_id}`); }
    catch (err) { busy(e.target, false); $("#jn-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}

async function groupView(id, tab) {
  const v = await api(`/api/hub/groups/${id}`);
  const g = v.group, lead = v.me.role === "leader";
  const tabs = [["overview", "Overview"], ...(lead ? [["review", `Review${v.queue.length ? ` (${v.queue.length})` : ""}`], ["members", "Members"], ["report", "Report"], ["share", "Invite"], ["settings", "Settings"]] : [])];
  if (!tabs.some(([t]) => t === tab)) tab = "overview";
  app.innerHTML = `<div class="stack-lg">
    <div class="row between"><div><h1>${esc(g.name)}</h1><p class="muted">${esc(KINDS[g.kind] || "")} · ${v.members} member${v.members === 1 ? "" : "s"}${lead ? ` · ${esc(g.plan_label)}` : ""}</p></div><a class="btn" href="${href("/log?group=" + g.id)}">Log hours for this group</a></div>
    ${tabs.length > 1 ? `<nav class="subtabs" aria-label="Group">${tabs.map(([t, l]) => `<a href="${href(`/groups/${g.id}/${t}`)}" ${t === tab ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>` : ""}
    <div id="gt"></div>
  </div>`;
  const box = $("#gt");
  if (tab === "overview") {
    box.innerHTML = `<div class="grid2"><div class="stack">
      <div class="kpis"><div class="kpi"><b>${esc(v.total_hours)}</b><span>approved hours${g.goal_hours ? ` of ${esc(g.goal_hours)} goal` : ""}</span></div><div class="kpi"><b>${v.members}</b><span>members</span></div></div>
      ${g.goal_hours ? `<div class="card"><b>${esc(g.goal_label || "Group goal")}</b><div class="bar"><i style="width:${pct(v.total_hours, g.goal_hours)}%"></i></div><span class="muted">${pct(v.total_hours, g.goal_hours)}% of ${esc(g.goal_hours)} hours${g.goal_ends ? " by " + esc(dateNice(g.goal_ends)) : ""}</span></div>` : ""}
      <div class="card"><h2>Leaderboard</h2>${v.leaderboard.some((r) => r.hours > 0) ? `<ol class="list" style="padding:0;margin:0;list-style:none">${v.leaderboard.filter((r) => r.hours > 0).map((r, i) => `<li><span><b>${i + 1}.</b> ${esc(r.name)}</span><span>${hrs(r.hours)}</span></li>`).join("")}</ol>` : `<p class="muted">Approved hours show up here.</p>`}</div>
    </div><div class="stack">
      <div class="card"><h2>Group badges</h2><div class="badge-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${v.badges.map((b) => `<div class="badge-card ${b.earned ? "" : "locked"}" style="border:0;padding:6px"><span class="badge giving" aria-hidden="true">${esc(b.label)}</span><b>${esc(b.name)}</b><small>${esc(b.how)}</small></div>`).join("")}</div></div>
      ${!lead ? `<div class="no-print"><button class="btn ghost small" id="leave" type="button">Leave group</button></div>` : ""}
    </div></div>`;
    $("#leave")?.addEventListener("click", async (e) => {
      if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "Tap again to leave"; return; }
      try { await api(`/api/hub/groups/${g.id}/leave`, { method: "POST" }); homeCache = null; go("/groups"); } catch (err) { toast(err.message); }
    });
  }
  if (tab === "review") {
    const verified = v.queue.filter((e) => e.status === "verified");
    box.innerHTML = `<div class="stack">
      <div class="row between"><p class="muted">Hours members logged for ${esc(g.name)}. Confirmed means the supervisor already said yes by email.</p>${verified.length ? `<button class="btn" id="all" type="button">Approve all confirmed (${verified.length})</button>` : ""}</div>
      ${v.queue.length ? `<div class="card"><div class="list">${v.queue.map((e) => `<div style="display:grid;gap:8px">
        <div class="row between"><b>${esc(e.member_name)}</b><span>${hrs(e.hours)}</span></div>
        <div><b>${esc(e.activity)}</b>${e.org_name ? ` · ${esc(e.org_name)}` : ""}<br><span class="meta">${esc(dateNice(e.date))}${e.supervisor_email ? " · Supervisor: " + esc(e.supervisor_name || e.supervisor_email) : " · No supervisor listed"}</span></div>
        ${e.reflection ? `<p class="meta">“${esc(e.reflection)}”</p>` : ""}
        <div class="row" style="gap:8px">${STATUS[e.status] || ""}${e.photo_url ? `<a class="btn ghost small" href="${esc(e.photo_url)}" target="_blank" rel="noopener">Photo</a>` : ""}
          <button class="btn small" type="button" data-ok="${e.id}">Approve</button><button class="btn ghost small" type="button" data-back="${e.id}">Send back</button></div>
      </div>`).join("")}</div></div>` : `<div class="card empty"><p>You're all caught up.</p></div>`}
    </div>`;
    const doReview = async (ids, action, note, btn) => { busy(btn, true); try { await api(`/api/hub/groups/${g.id}/review`, { method: "POST", body: { ids, action, note } }); homeCache = null; toast(action === "approve" ? "Approved." : "Sent back."); groupView(g.id, "review"); } catch (e) { busy(btn, false); toast(e.message); } };
    $("#all")?.addEventListener("click", (e) => doReview(verified.map((x) => x.id), "approve", null, e.target));
    $$("[data-ok]").forEach((b) => b.addEventListener("click", () => doReview([b.dataset.ok], "approve", null, b)));
    $$("[data-back]").forEach((b) => b.addEventListener("click", () => {
      const row = b.parentNode;
      row.innerHTML = `<div class="field" style="flex:1;min-width:220px"><label for="n-${b.dataset.back}">Note so they know what to fix (optional)</label><input id="n-${b.dataset.back}"></div><button class="btn small" type="button" id="sb-${b.dataset.back}">Send back</button>`;
      $(`#n-${b.dataset.back}`).focus();
      $(`#sb-${b.dataset.back}`).addEventListener("click", (ev) => doReview([b.dataset.back], "return", $(`#n-${b.dataset.back}`).value, ev.target));
    }));
  }
  if (tab === "members") {
    box.innerHTML = `<div class="card"><div class="row between"><h2>Members</h2><a class="btn ghost small" href="/api/hub/groups/${g.id}/export" data-csv>Download hours (CSV)</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Role</th><th class="num">Approved hours</th>${g.per_member_hours ? "<th>On track</th>" : ""}<th></th></tr></thead><tbody>
      ${v.roster.map((m) => `<tr><td><b>${esc(m.name)}</b><br><span class="meta">${esc(m.email || "")}</span></td><td>${m.role === "leader" ? "Leader" : "Member"}</td><td class="num">${esc(m.hours)}</td>${g.per_member_hours ? `<td>${m.on_track ? `<span class="pill ok">Yes</span>` : `<span class="pill warn">Not yet</span>`}</td>` : ""}
        <td class="row" style="gap:6px;justify-content:flex-end">${m.profile_id === me.id ? "" : `<button class="btn ghost small" type="button" data-role="${m.member_id}" data-to="${m.role === "leader" ? "member" : "leader"}">${m.role === "leader" ? "Make member" : "Make leader"}</button><button class="btn ghost small" type="button" data-rm="${m.member_id}">Remove</button>`}</td></tr>`).join("")}
      </tbody></table></div></div>`;
    $("[data-csv]").addEventListener("click", async (e) => {
      e.preventDefault();
      const res = await fetch(`/api/hub/groups/${g.id}/export`, { headers: { authorization: `Bearer ${token}` } });
      const blob = await res.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${g.name.replace(/[^a-z0-9]+/gi, "-")}-hours.csv`; a.click();
    });
    $$("[data-role]").forEach((b) => b.addEventListener("click", async () => { try { await api(`/api/hub/groups/${g.id}/members/${b.dataset.role}`, { method: "PATCH", body: { role: b.dataset.to } }); groupView(g.id, "members"); } catch (e) { toast(e.message); } }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tap to confirm"; return; }
      try { await api(`/api/hub/groups/${g.id}/members/${b.dataset.rm}`, { method: "PATCH", body: { status: "removed" } }); groupView(g.id, "members"); } catch (e) { toast(e.message); }
    }));
  }
  if (tab === "report") {
    const now = new Date(); const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
    const sel = new URLSearchParams(location.search).get("month") || months[0];
    const r = await api(`/api/hub/groups/${g.id}/report?month=${sel}`);
    const label = new Date(sel + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    box.innerHTML = `<div class="stack">
      <div class="row between no-print"><div class="field" style="min-width:220px"><label for="rm">Month</label><select id="rm">${months.map((m) => `<option value="${m}" ${m === sel ? "selected" : ""}>${new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>`).join("")}</select></div><button class="btn" type="button" onclick="print()">Print or save as PDF</button></div>
      <div class="transcript-doc">
        <div class="row between"><img class="logo" src="/images/brand/logo-horizontal.svg" alt="That's Just Good"><span class="muted">My Impact Hub</span></div>
        <div><span class="eyebrow">${esc(label)} impact report</span><h1 style="font-size:clamp(1.6rem,4vw,2.6rem)">${esc(g.name)} showed up</h1></div>
        <div class="kpis"><div class="kpi"><b>${esc(r.hours)}</b><span>hours of service</span></div><div class="kpi"><b>${r.volunteers}</b><span>members served</span></div><div class="kpi"><b>${r.activities}</b><span>activities</span></div><div class="kpi"><b>${r.new_members}</b><span>new members</span></div></div>
        ${g.goal_hours ? `<div><b>${esc(r.total_to_date)} of ${esc(g.goal_hours)} hours toward the ${esc(g.goal_label || "group goal")}</b><div class="bar" style="margin-top:8px"><i style="width:${pct(r.total_to_date, g.goal_hours)}%"></i></div></div>` : ""}
        <div class="grid2">
          <div><h2>Top members</h2>${r.top.length ? `<ol>${r.top.map((t) => `<li>${esc(t.name)}: ${hrs(t.hours)}</li>`).join("")}</ol>` : `<p class="muted">No approved hours this month.</p>`}</div>
          <div><h2>Causes</h2>${r.causes.length ? `<ul>${r.causes.map((c) => `<li>${esc(c.cause)}: ${hrs(c.hours)}</li>`).join("")}</ul>` : `<p class="muted">No causes tagged.</p>`}${r.organizations.length ? `<h2 style="margin-top:14px">Where we served</h2><ul>${r.organizations.map((o) => `<li>${esc(o.name)}</li>`).join("")}</ul>` : ""}</div>
        </div>
        <p class="muted" style="font-size:.9rem">Counts hours approved by group leaders. Tracked on My Impact Hub by That's Just Good.</p>
      </div>
    </div>`;
    $("#rm").addEventListener("change", (e) => go(`/groups/${g.id}/report?month=${e.target.value}`));
  }
  if (tab === "share") {
    box.innerHTML = `<div class="grid2"><div class="card">
      <h2>Invite members</h2><p class="muted">Share this link or have people scan the code. They'll sign in and join in seconds.</p>
      <div class="copy"><code>${esc(g.join_url)}</code><button class="btn small" type="button" id="cp">Copy</button></div>
      <p>Join code: <b style="font-size:1.3rem;letter-spacing:.08em">${esc(g.join_code)}</b></p>
      ${g.member_limit ? `<p class="muted">Your ${esc(g.plan_label)} includes up to ${g.member_limit} members.</p>` : ""}
    </div><div class="card" style="justify-items:center"><img class="qr" src="/api/hub/qr/${esc(g.join_code)}.png" alt="QR code to join ${esc(g.name)}"><a class="btn ghost small" href="/api/hub/qr/${esc(g.join_code)}.png" download="${esc(g.join_code)}-qr.png">Download QR code</a></div></div>`;
    $("#cp").addEventListener("click", async () => { try { await navigator.clipboard.writeText(g.join_url); toast("Link copied."); } catch { toast("Press and hold the link to copy it."); } });
  }
  if (tab === "settings") {
    box.innerHTML = `<form id="sf" class="card" style="max-width:720px">
      <div class="field"><label for="sf-name">Group name</label><input id="sf-name" name="name" value="${esc(g.name)}" required></div>
      <div class="form-row"><div class="field"><label for="sf-goal">Group hour goal</label><input id="sf-goal" name="goal_hours" type="number" min="1" value="${esc(g.goal_hours ?? "")}"></div><div class="field"><label for="sf-label">Goal name</label><input id="sf-label" name="goal_label" value="${esc(g.goal_label ?? "")}" placeholder="Fall semester"></div></div>
      <div class="form-row"><div class="field"><label for="sf-ends">Goal ends</label><input id="sf-ends" name="goal_ends" type="date" value="${esc(g.goal_ends ?? "")}"></div><div class="field"><label for="sf-per">Hours required per member</label><input id="sf-per" name="per_member_hours" type="number" min="0" step="0.5" value="${esc(g.per_member_hours ?? "")}"></div></div>
      <div class="field"><label for="sf-dom">Auto-join email domain <span class="muted">(optional)</span></label><input id="sf-dom" name="email_domain" value="${esc(g.email_domain ?? "")}" placeholder="lincolnisd.org"><span class="muted" style="font-size:.9rem">People who sign up with this school or work email join automatically.</span></div>
      <div><button class="btn" type="submit">Save settings</button></div><div id="sf-msg" aria-live="polite"></div>
      <p class="muted" style="font-size:.92rem">Plan: ${esc(g.plan_label)}. To upgrade, email <a href="mailto:dogood@thatsjustgood.com?subject=Upgrade%20${encodeURIComponent(g.name)}">dogood@thatsjustgood.com</a>.</p>
    </form>`;
    $("#sf").addEventListener("submit", async (e) => {
      e.preventDefault(); const b = e.target.querySelector("button"); busy(b, true, "Saving…");
      try { await api(`/api/hub/groups/${g.id}`, { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) }); homeCache = null; toast("Saved."); groupView(g.id, "settings"); }
      catch (err) { busy(b, false); $("#sf-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
    });
  }
}

/* ---------------- Transcripts ---------------- */
async function transcriptsView() {
  const r = await api("/api/hub/transcripts");
  app.innerHTML = `<div class="stack-lg" style="max-width:820px">
    <h1>Verified transcripts</h1>
    <p class="muted">A transcript is a snapshot of your confirmed hours with a check code. Colleges, scholarship programs and employers can confirm it's real.</p>
    ${r.access.ok ? `<div class="card"><div class="row between"><span>Included through <b>${esc(r.access.via)}</b>.</span><button class="btn" id="mk" type="button">Create a new transcript</button></div><div id="mk-msg" aria-live="polite"></div></div>`
      : `<div class="card"><b>Transcripts come with the Verified Student plan ($39 a year) or a paid group plan.</b><p class="muted">Email <a href="mailto:dogood@thatsjustgood.com?subject=Verified%20Student">dogood@thatsjustgood.com</a> to get the Verified Student plan, or ask your group leader about upgrading.</p></div>`}
    <div class="card"><h2>My transcripts</h2>${r.transcripts.length ? `<div class="list">${r.transcripts.map((t) => `<a class="rowlink" href="${esc(t.url)}" target="_blank" rel="noopener"><span><b>${esc(t.code)}</b><br><span class="meta">${esc(dateNice(t.created_at.slice(0, 10)))} · ${hrs(t.total)}</span></span><span class="btn ghost small">Open</span></a>`).join("")}</div>` : `<p class="muted">None yet.</p>`}</div>
  </div>`;
  $("#mk")?.addEventListener("click", async (e) => {
    busy(e.target, true, "Creating…");
    try { const t = await api("/api/hub/transcripts", { method: "POST" }); window.open(t.url, "_blank", "noopener"); transcriptsView(); }
    catch (err) { busy(e.target, false); $("#mk-msg").innerHTML = `<div class="alert error">${esc(err.message)}</div>`; }
  });
}

/* ---------------- Public: transcript check and supervisor confirmation ---------------- */
async function verifyView(code) {
  chrome(Boolean(token && me));
  const t = await api(`/api/hub/verify/${encodeURIComponent(code)}`);
  app.innerHTML = `<div class="stack" style="max-width:860px;margin:0 auto">
    <div class="row between no-print"><span class="pill ok">Verified by My Impact Hub</span><button class="btn small" type="button" onclick="print()">Print or save as PDF</button></div>
    <div class="transcript-doc">
      <div class="row between"><img class="logo" src="/images/brand/logo-horizontal.svg" alt="That's Just Good"><span class="muted">Issued ${esc(dateNice(t.issued))} · ${esc(t.code)}</span></div>
      <h1 style="font-size:clamp(1.5rem,4vw,2.2rem);text-transform:uppercase">Verified service transcript</h1>
      <div class="kpis"><div class="kpi"><span>Name</span><b style="font-size:1.3rem">${esc(t.name)}</b></div>${t.grad_year ? `<div class="kpi"><span>Class of</span><b style="font-size:1.3rem">${esc(t.grad_year)}</b></div>` : ""}<div class="kpi"><span>Verified hours</span><b style="font-size:1.3rem">${esc(t.total)}</b></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Activity</th><th>Verified by</th><th style="text-align:right">Hours</th></tr></thead><tbody>
        ${t.entries.map((e) => `<tr><td>${esc(dateNice(e.date))}</td><td><b>${esc(e.activity)}</b>${e.org_name ? `<br>${esc(e.org_name)}` : ""}</td><td>${esc(e.verified_by)}</td><td style="text-align:right">${esc(e.hours)}</td></tr>`).join("")}
        <tr class="tot"><td></td><td>Total verified service</td><td></td><td style="text-align:right">${esc(t.total)}</td></tr>
      </tbody></table></div>
      <p class="muted" style="font-size:.9rem">Each hour was confirmed by the listed supervisor by email or approved by a group leader. Check this transcript anytime at ${esc(location.origin + href("/verify/" + t.code))}.</p>
    </div>
  </div>`;
}

async function confirmView(tok) {
  chrome(Boolean(token && me));
  const r = await api(`/api/hub/confirm/${encodeURIComponent(tok)}`);
  const e = r.entry;
  const done = e.status === "verified" || e.status === "declined";
  app.innerHTML = `<div class="signin card">
    <h1>${done ? "Thanks, you're all set" : `Confirm ${esc(r.name.split(" ")[0])}'s hours`}</h1>
    <p>${esc(r.name)} logged these volunteer hours and listed you as their supervisor.</p>
    <div class="list"><div><span class="meta">Activity</span><b>${esc(e.activity)}</b></div>${e.org_name ? `<div><span class="meta">Organization</span><b>${esc(e.org_name)}</b></div>` : ""}<div><span class="meta">Date</span><b>${esc(dateNice(e.date))}</b></div><div><span class="meta">Hours</span><b>${esc(e.hours)}</b></div></div>
    <div id="cf-area">${done ? `<div class="alert ${e.status === "verified" ? "success" : ""}">${e.status === "verified" ? "These hours are confirmed." : "You declined these hours."}</div>`
      : `<div class="row"><button class="btn" type="button" data-d="confirm">Yes, confirm these hours</button><button class="btn ghost" type="button" data-d="decline">This isn't right</button></div>`}</div>
    <p class="muted" style="font-size:.9rem">My Impact Hub by That's Just Good helps volunteers keep a trusted record of their service. No account needed to confirm.</p>
  </div>`;
  $$("[data-d]").forEach((b) => b.addEventListener("click", async () => {
    busy(b, true);
    try { const res = await api(`/api/hub/confirm/${encodeURIComponent(tok)}`, { method: "POST", body: { decision: b.dataset.d } }); $("#cf-area").innerHTML = `<div class="alert ${res.status === "verified" ? "success" : ""}">${res.status === "verified" ? "Thank you! These hours are confirmed." : "Thanks for letting us know. These hours won't count as confirmed."}</div>`; }
    catch (err) { busy(b, false); toast(err.message); }
  }));
}

boot();
