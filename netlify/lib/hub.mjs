// My Impact Hub: accounts, groups, logged hours, supervisor confirmation, leader approval,
// badges, monthly reports and verified transcripts. Also website leads for the dashboard.
import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { getStore, isConfigured } from "./store.mjs";
import { table } from "./hubdata.mjs";
import { personalBadges, groupBadges, isVerified, HUB_CAUSES } from "./badges.mjs";
import { layout, detailRows, sendEmail } from "./notify.mjs";
import { json, fail, SITE, token, code, esc, isEmail } from "./util.mjs";

/* ---------------- Basics ---------------- */
export const HUB_URL = () => process.env.HUB_URL || (/localhost|127\.0\.0\.1/.test(SITE()) ? `${SITE()}/hub` : "https://hub.thatsjustgood.com");
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const num = (v) => Math.round(Number(v) * 100) / 100;
const sum = (rows) => num(rows.reduce((s, e) => s + Number(e.hours), 0));
const today = () => new Date().toISOString().slice(0, 10);
const clean = (s, max = 200) => String(s ?? "").trim().slice(0, max);
const CAUSE_CODES = HUB_CAUSES.map((c) => c[0]);

export const GROUP_PLANS = {
  starter: { label: "Starter Group (free)", members: 25, leaders: 1, transcripts: false },
  group: { label: "Group, $19 a month", members: Infinity, leaders: 3, transcripts: true },
  group_plus: { label: "Group Plus, $49 a month", members: Infinity, leaders: 10, transcripts: true },
  network: { label: "Network, $99 a month", members: Infinity, leaders: 10, transcripts: true },
  team: { label: "Company Team, $99 a month", members: 50, leaders: 2, transcripts: true },
  business: { label: "Company Business, $299 a month", members: 250, leaders: 5, transcripts: true },
  business_plus: { label: "Company Business Plus, $599 a month", members: 1000, leaders: 10, transcripts: true },
  enterprise: { label: "Enterprise", members: Infinity, leaders: 50, transcripts: true },
};
const planOf = (g) => GROUP_PLANS[g.plan] || GROUP_PLANS.starter;

/* ---------------- Sign-in ---------------- */
const devId = (email) => {
  const h = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Who is calling: { user: { id, email }, profile } or throws 401. */
export async function requireMember(req, { needProfile = true } = {}) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw err("Please sign in.", 401);
  let user;
  if (!isConfigured()) {
    const m = jwt.match(/^dev-member:(.+@.+)$/);
    if (!m) throw err("Please sign in.", 401);
    user = { id: devId(m[1]), email: m[1].toLowerCase() };
  } else {
    const store = await getStore();
    const { data, error } = await store.client.auth.getUser(jwt);
    if (error || !data?.user) throw err("Your sign-in expired. Please sign in again.", 401);
    user = { id: data.user.id, email: (data.user.email || "").toLowerCase() };
  }
  const profile = await (await table("hub_profiles")).get(user.id);
  if (needProfile && !profile) throw err("Finish setting up your profile first.", 409);
  return { user, profile };
}

export async function saveProfile(user, f) {
  const P = await table("hub_profiles");
  const name = clean(f.name, 120);
  if (!name) throw err("Add your name.");
  const existing = await P.get(user.id);
  if (!existing && !f.age_ok) throw err("You need to be 13 or older to make an account. Younger students can join through their school.");
  const grad = f.grad_year ? Number(f.grad_year) : null;
  if (grad && (grad < 1950 || grad > 2045)) throw err("Check your graduation year.");
  if (existing) return P.update(user.id, { name, grad_year: grad });
  const profile = await P.insert({ id: user.id, email: user.email, name, grad_year: grad, age_ok: true, plan: "free" });
  // Work and school emails join their organization's group automatically
  const domain = user.email.split("@")[1];
  for (const g of await (await table("hub_groups")).list({ eq: { email_domain: domain } })) {
    try { await joinGroup(profile, g); } catch { /* group full: they can still join with a code later */ }
  }
  return profile;
}

/* ---------------- Groups ---------------- */
async function membership(groupId, profileId) {
  return (await table("hub_members")).one({ group_id: groupId, profile_id: profileId });
}
async function activeMembers(groupId) {
  return (await table("hub_members")).list({ eq: { group_id: groupId, status: "active" } });
}
export async function requireGroup(groupId, profile, { leader = false } = {}) {
  const g = await (await table("hub_groups")).get(groupId);
  if (!g) throw err("We couldn't find that group.", 404);
  const m = await membership(g.id, profile.id);
  if (!m || m.status !== "active") throw err("You're not a member of this group.", 403);
  if (leader && m.role !== "leader") throw err("Only group leaders can do that.", 403);
  return { group: g, member: m };
}

export async function createGroup(profile, f) {
  const G = await table("hub_groups");
  const name = clean(f.name, 120);
  if (!name) throw err("Give your group a name.");
  const kind = ["club", "chapter", "school", "company", "nonprofit", "faith", "team", "other"].includes(f.kind) ? f.kind : "club";
  let g;
  for (let i = 0; i < 5 && !g; i++) {
    try { g = await G.insert({ name, kind, join_code: code(6), plan: "starter", goal_hours: f.goal_hours ? num(f.goal_hours) : null, goal_label: clean(f.goal_label, 80) || null, goal_ends: f.goal_ends || null, per_member_hours: f.per_member_hours ? num(f.per_member_hours) : null, created_by: profile.id }); }
    catch (e) { if (e.code !== "23505") throw e; }
  }
  await (await table("hub_members")).insert({ group_id: g.id, profile_id: profile.id, role: "leader", status: "active" });
  return g;
}

export async function joinGroup(profile, g) {
  const M = await table("hub_members");
  const existing = await membership(g.id, profile.id);
  if (existing?.status === "active") return existing;
  const count = (await activeMembers(g.id)).length;
  if (count >= planOf(g).members) throw err(`${g.name} is full on its current plan. Ask a group leader to upgrade.`);
  if (existing) return M.update(existing.id, { status: "active", role: "member" });
  return M.insert({ group_id: g.id, profile_id: profile.id, role: "member", status: "active" });
}

export async function updateGroup(group, f) {
  const patch = {};
  if ("name" in f) { const n = clean(f.name, 120); if (!n) throw err("Give your group a name."); patch.name = n; }
  for (const k of ["goal_hours", "per_member_hours"]) if (k in f) patch[k] = f[k] === "" || f[k] == null ? null : num(f[k]);
  if ("goal_label" in f) patch.goal_label = clean(f.goal_label, 80) || null;
  if ("goal_ends" in f) patch.goal_ends = f.goal_ends || null;
  if ("kind" in f) patch.kind = f.kind;
  if ("email_domain" in f) {
    const d = clean(f.email_domain, 120).toLowerCase().replace(/^@/, "");
    if (d && ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"].includes(d)) throw err("Use your school or company's own email domain, not a personal email service.");
    patch.email_domain = d || null;
  }
  return (await table("hub_groups")).update(group.id, patch);
}

export async function setMember(group, memberId, f, actingProfileId) {
  const M = await table("hub_members");
  const m = await M.get(memberId);
  if (!m || m.group_id !== group.id) throw err("Member not found.", 404);
  const patch = {};
  if (f.role) {
    if (!["leader", "member"].includes(f.role)) throw err("Choose a role.");
    if (f.role === "leader") {
      const leaders = (await activeMembers(group.id)).filter((x) => x.role === "leader").length;
      if (leaders >= planOf(group).leaders) throw err(`Your plan includes ${planOf(group).leaders} leader${planOf(group).leaders > 1 ? "s" : ""}. Upgrade to add more.`);
    }
    if (f.role === "member" && m.profile_id === actingProfileId) throw err("You can't remove your own leader role. Make someone else a leader first.");
    patch.role = f.role;
  }
  if (f.status === "removed") {
    if (m.profile_id === actingProfileId) throw err("Use Leave group to remove yourself.");
    patch.status = "removed";
  }
  return M.update(m.id, patch);
}

/* ---------------- Hours ---------------- */
export async function createEntry(profile, f) {
  const activity = clean(f.activity, 140);
  if (!activity) throw err("Say what you did.");
  const hours = num(f.hours);
  if (!(hours > 0 && hours <= 24)) throw err("Hours must be between 0.25 and 24.");
  const date = String(f.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err("Pick the date.");
  if (date > today()) throw err("You can't log hours for a future date.");
  if (!f.honor) throw err("Check the box to confirm your hours are accurate.");
  let groupId = f.group_id || null;
  if (groupId) await requireGroup(groupId, profile);
  const supEmail = clean(f.supervisor_email, 160).toLowerCase();
  if (supEmail && !isEmail(supEmail)) throw err("Check the supervisor's email address.");
  if (supEmail && supEmail === profile.email.toLowerCase()) throw err("Your supervisor has to be someone other than you.");
  const cause = CAUSE_CODES.includes(f.cause) ? f.cause : null;
  const E = await table("hub_entries");
  const e = await E.insert({
    profile_id: profile.id, group_id: groupId, activity, org_name: clean(f.org_name, 140) || null, cause, date, hours,
    reflection: clean(f.reflection, 2000) || null, supervisor_name: clean(f.supervisor_name, 120) || null, supervisor_email: supEmail || null,
    verify_token: supEmail ? token() : null, status: supEmail ? "awaiting_supervisor" : "unverified", honor: true, approval: null,
  });
  if (supEmail) await supervisorEmail(e, profile);
  return e;
}

function supervisorEmail(e, profile) {
  const url = `${HUB_URL()}/confirm/${e.verify_token}`;
  return sendEmail({
    to: e.supervisor_email, toName: e.supervisor_name || undefined,
    subject: `Can you confirm ${profile.name}'s volunteer hours?`,
    html: layout({
      preheader: `${profile.name} logged ${e.hours} hours. It takes one click to confirm.`,
      heading: `Please confirm ${esc(profile.name.split(" ")[0])}'s hours`,
      body: `<p>${esc(profile.name)} logged volunteer hours on My Impact Hub and listed you as the person who can confirm them.</p>
      ${detailRows([["Activity", esc(e.activity)], ["Organization", esc(e.org_name)], ["Date", esc(new Date(e.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))], ["Hours", esc(e.hours)]])}
      <p>No account needed. Just tap the button and choose confirm or decline.</p>`,
      cta: "Review these hours", ctaUrl: url,
      footerNote: "If you don't know this person or this activity, you can decline or ignore this email.",
    }),
  });
}

export async function resendSupervisor(profile, id) {
  const e = await (await table("hub_entries")).get(id);
  if (!e || e.profile_id !== profile.id) throw err("Entry not found.", 404);
  if (e.status !== "awaiting_supervisor") throw err("These hours aren't waiting on a supervisor.");
  await supervisorEmail(e, profile);
  return e;
}

export async function deleteEntry(profile, id) {
  const E = await table("hub_entries");
  const e = await E.get(id);
  if (!e || e.profile_id !== profile.id) throw err("Entry not found.", 404);
  if (e.approval === "approved") throw err("Approved hours can't be deleted. Ask your group leader if something's wrong.");
  await E.remove(id);
}

export async function supervisorView(tok) {
  const e = await (await table("hub_entries")).one({ verify_token: tok });
  if (!e) throw err("This link isn't valid anymore.", 404);
  const p = await (await table("hub_profiles")).get(e.profile_id);
  return { entry: { activity: e.activity, org_name: e.org_name, date: e.date, hours: e.hours, reflection: e.reflection, status: e.status }, name: p?.name || "A volunteer" };
}

export async function supervisorDecide(tok, decision) {
  const E = await table("hub_entries");
  const e = await E.one({ verify_token: tok });
  if (!e) throw err("This link isn't valid anymore.", 404);
  if (!["confirm", "decline"].includes(decision)) throw err("Choose confirm or decline.");
  if (e.status === "verified" || e.status === "declined") return { status: e.status, already: true };
  const upd = await E.update(e.id, decision === "confirm" ? { status: "verified", verified_at: new Date().toISOString() } : { status: "declined" });
  return { status: upd.status };
}

/* ---------------- Approvals ---------------- */
export async function review(group, leaderProfile, ids, action, note) {
  if (!["approve", "return"].includes(action)) throw err("Choose approve or send back.");
  const E = await table("hub_entries");
  const done = [];
  for (const id of ids || []) {
    const e = await E.get(id);
    if (!e || e.group_id !== group.id) continue;
    if (e.profile_id === leaderProfile.id && action === "approve") {
      const others = (await activeMembers(group.id)).filter((m) => m.role === "leader" && m.profile_id !== leaderProfile.id);
      if (others.length) continue; // another leader should approve your own hours
    }
    done.push(await E.update(id, action === "approve"
      ? { approval: "approved", approved_at: new Date().toISOString(), approved_by: leaderProfile.id, return_note: null }
      : { approval: "returned", return_note: clean(note, 500) || null }));
  }
  return done;
}

/* ---------------- Views ---------------- */
async function profilesById(ids) {
  const P = await table("hub_profiles");
  const out = {};
  for (const id of [...new Set(ids)]) out[id] = await P.get(id);
  return out;
}

export async function transcriptAccess(profile) {
  if (profile.plan === "verified" && (!profile.plan_until || profile.plan_until >= today())) return { ok: true, via: "Verified Student" };
  const M = await table("hub_members"), G = await table("hub_groups");
  for (const m of await M.list({ eq: { profile_id: profile.id, status: "active" } })) {
    const g = await G.get(m.group_id);
    if (g && planOf(g).transcripts) return { ok: true, via: g.name };
  }
  return { ok: false };
}

export async function home(profile) {
  const E = await table("hub_entries"), M = await table("hub_members"), G = await table("hub_groups");
  const entries = await E.list({ eq: { profile_id: profile.id }, order: "date", desc: true });
  const b = personalBadges(entries);
  const groups = [];
  for (const m of await M.list({ eq: { profile_id: profile.id, status: "active" } })) {
    const g = await G.get(m.group_id);
    if (!g) continue;
    const mine = entries.filter((e) => e.group_id === g.id && e.approval === "approved");
    const groupApproved = (await E.list({ eq: { group_id: g.id, approval: "approved" } }));
    const queue = m.role === "leader" ? (await E.list({ eq: { group_id: g.id, approval: null } })).filter((e) => e.status !== "declined").length : 0;
    groups.push({ id: g.id, name: g.name, kind: g.kind, role: m.role, goal_hours: g.goal_hours, goal_label: g.goal_label, group_hours: sum(groupApproved), my_hours: sum(mine), per_member_hours: g.per_member_hours, to_review: queue });
  }
  const recentActivities = [...new Map(entries.map((e) => [e.activity.toLowerCase(), { activity: e.activity, org_name: e.org_name, cause: e.cause, supervisor_name: e.supervisor_name, supervisor_email: e.supervisor_email, hours: e.hours, group_id: e.group_id }])).values()].slice(0, 6);
  return {
    profile,
    totals: { verified: sum(entries.filter(isVerified)), pending: sum(entries.filter((e) => !isVerified(e) && e.status !== "declined")), entries: entries.length },
    groups,
    badges: { earned: b.badges.filter((x) => x.earned).slice(-6).reverse(), next: b.badges.filter((x) => !x.earned && x.progress > 0).sort((a, z) => z.progress - a.progress).slice(0, 3), count: b.earnedCount },
    recent: entries.slice(0, 5),
    recentActivities,
    transcripts: await transcriptAccess(profile),
    causes: HUB_CAUSES.map(([c, label]) => ({ code: c, label })),
  };
}

export async function groupView(group, member, profile) {
  const E = await table("hub_entries");
  const all = await E.list({ eq: { group_id: group.id }, order: "date", desc: true });
  const approved = all.filter((e) => e.approval === "approved");
  const members = await activeMembers(group.id);
  const people = await profilesById([...members.map((m) => m.profile_id), ...all.map((e) => e.profile_id)]);
  const hoursBy = {};
  for (const e of approved) hoursBy[e.profile_id] = (hoursBy[e.profile_id] || 0) + Number(e.hours);
  const roster = members.map((m) => ({
    member_id: m.id, profile_id: m.profile_id, name: people[m.profile_id]?.name || "Member", email: member.role === "leader" ? people[m.profile_id]?.email : undefined,
    role: m.role, hours: num(hoursBy[m.profile_id] || 0), joined: m.created_at,
    on_track: group.per_member_hours ? (hoursBy[m.profile_id] || 0) >= group.per_member_hours : null,
  })).sort((a, b) => b.hours - a.hours);
  const total = sum(approved);
  const out = {
    group: { ...group, plan_label: planOf(group).label, join_url: `${HUB_URL()}/join/${group.join_code}`, member_limit: Number.isFinite(planOf(group).members) ? planOf(group).members : null },
    me: { role: member.role, member_id: member.id },
    total_hours: total,
    members: roster.length,
    leaderboard: roster.slice(0, 10).map(({ name, hours }) => ({ name, hours })),
    badges: groupBadges(total, roster.length, roster.filter((r) => r.hours > 0).length),
  };
  if (member.role === "leader") {
    out.roster = roster;
    out.queue = all.filter((e) => e.approval == null && e.status !== "declined").map((e) => ({ ...e, member_name: people[e.profile_id]?.name || "Member" }));
    out.returned = all.filter((e) => e.approval === "returned").slice(0, 20).map((e) => ({ ...e, member_name: people[e.profile_id]?.name || "Member" }));
  }
  return out;
}

export async function monthlyReport(group, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw err("Pick a month.");
  const E = await table("hub_entries");
  const all = await E.list({ eq: { group_id: group.id, approval: "approved" } });
  const inMonth = all.filter((e) => e.date.startsWith(month));
  const people = await profilesById(inMonth.map((e) => e.profile_id));
  const by = {}, causes = {}, orgs = {};
  for (const e of inMonth) {
    by[e.profile_id] = (by[e.profile_id] || 0) + Number(e.hours);
    if (e.cause) causes[e.cause] = (causes[e.cause] || 0) + Number(e.hours);
    if (e.org_name) orgs[e.org_name] = (orgs[e.org_name] || 0) + Number(e.hours);
  }
  const members = await activeMembers(group.id);
  const newMembers = members.filter((m) => m.created_at.slice(0, 7) === month).length;
  const label = (c) => HUB_CAUSES.find((x) => x[0] === c)?.[1] || c;
  return {
    group: { name: group.name, goal_hours: group.goal_hours, goal_label: group.goal_label },
    month,
    hours: sum(inMonth), activities: inMonth.length, volunteers: Object.keys(by).length, new_members: newMembers,
    total_to_date: sum(all),
    top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, h]) => ({ name: people[id]?.name || "Member", hours: num(h) })),
    causes: Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([c, h]) => ({ cause: label(c), hours: num(h) })),
    organizations: Object.entries(orgs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([o, h]) => ({ name: o, hours: num(h) })),
  };
}

export async function groupCsv(group) {
  const E = await table("hub_entries");
  const all = await E.list({ eq: { group_id: group.id }, order: "date" });
  const people = await profilesById(all.map((e) => e.profile_id));
  const rows = [["Date", "Member", "Email", "Activity", "Organization", "Cause", "Hours", "Supervisor", "Supervisor status", "Group approval"]];
  for (const e of all) rows.push([e.date, people[e.profile_id]?.name, people[e.profile_id]?.email, e.activity, e.org_name, e.cause, e.hours, e.supervisor_email, e.status, e.approval || "waiting"]);
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

/* ---------------- Transcripts ---------------- */
export async function createTranscript(profile) {
  const access = await transcriptAccess(profile);
  if (!access.ok) throw err("Verified transcripts come with the Verified Student plan or a paid group plan.", 402);
  const E = await table("hub_entries"), G = await table("hub_groups");
  const entries = (await E.list({ eq: { profile_id: profile.id }, order: "date" })).filter(isVerified);
  if (!entries.length) throw err("You don't have any verified hours yet. Hours count once a supervisor confirms them or a group leader approves them.");
  const groupNames = {};
  for (const id of [...new Set(entries.map((e) => e.group_id).filter(Boolean))]) groupNames[id] = (await G.get(id))?.name;
  const snapshot = {
    name: profile.name, grad_year: profile.grad_year, issued: today(), total: sum(entries),
    entries: entries.map((e) => ({ date: e.date, activity: e.activity, org_name: e.org_name, hours: Number(e.hours), verified_by: e.status === "verified" ? (e.supervisor_name || "Supervisor") + " (email confirmed)" : `Approved by ${groupNames[e.group_id] || "group"} leader`, reflection: e.reflection })),
  };
  const T = await table("hub_transcripts");
  return T.insert({ profile_id: profile.id, code: `TJG-${code(4)}-${code(4)}`, snapshot });
}

export async function verifyTranscript(c) {
  const t = await (await table("hub_transcripts")).one({ code: String(c || "").toUpperCase() });
  if (!t) throw err("We couldn't find a transcript with that code.", 404);
  return { code: t.code, created_at: t.created_at, ...t.snapshot };
}

/* ---------------- Leads (website forms) ---------------- */
const LEAD_KINDS = { "hub-waitlist": "hub_waitlist", "impact-partners": "partners", contact: "contact", hub_waitlist: "hub_waitlist", partners: "partners" };
export async function saveLead(f) {
  const kind = LEAD_KINDS[f.kind || f["form-name"]];
  const email = clean(f.email, 160).toLowerCase();
  if (!kind || !isEmail(email)) throw err("Add a valid email.");
  const { kind: _k, "form-name": _f, "bot-field": bot, name, email: _e, organization, company, ...rest } = f;
  if (bot) return { ok: true };
  const details = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, clean(v, 3000)]).filter(([, v]) => v));
  await (await table("leads")).insert({ kind, name: clean(name, 120) || null, email, organization: clean(organization || company, 160) || null, details, status: "new" });
  return { ok: true };
}

export function hubInvite(lead) {
  return sendEmail({
    to: lead.email, toName: lead.name || undefined, subject: "You're invited to My Impact Hub",
    html: layout({
      preheader: "Your spot on My Impact Hub is ready.",
      heading: `You're in${lead.name ? ", " + esc(lead.name.split(" ")[0]) : ""}!`,
      body: `<p>Thanks for joining the waitlist. My Impact Hub is ready for you: log volunteer hours, get them confirmed, and track your group's impact in one place.</p><p>Sign in with this email address to get started. It's free for individuals.</p>`,
      cta: "Open My Impact Hub", ctaUrl: HUB_URL(),
    }),
  });
}

/* ---------------- Admin ---------------- */
export async function adminHub() {
  const P = await table("hub_profiles"), G = await table("hub_groups"), M = await table("hub_members"), E = await table("hub_entries");
  const profiles = await P.list({ desc: true }), groups = await G.list({ desc: true }), entries = await E.list({});
  const members = await M.list({ eq: { status: "active" } });
  const month = new Date().toISOString().slice(0, 7);
  return {
    stats: { people: profiles.length, groups: groups.length, verified_hours: sum(entries.filter(isVerified)), hours_this_month: sum(entries.filter((e) => e.date.startsWith(month))), paid_groups: groups.filter((g) => g.plan !== "starter").length, verified_students: profiles.filter((p) => p.plan === "verified").length },
    groups: groups.map((g) => ({ ...g, members: members.filter((m) => m.group_id === g.id).length, hours: sum(entries.filter((e) => e.group_id === g.id && e.approval === "approved")), plan_label: planOf(g).label })),
    people: profiles.slice(0, 200).map((p) => ({ ...p, hours: sum(entries.filter((e) => e.profile_id === p.id && isVerified(e))), groups: members.filter((m) => m.profile_id === p.id).length })),
    plans: Object.fromEntries(Object.entries(GROUP_PLANS).map(([k, v]) => [k, v.label])),
  };
}

/* ---------------- Routes ---------------- */
export function registerHubRoutes(on, admin) {
  const body = async (req) => { try { return await req.json(); } catch { return {}; } };
  const member = (method, pattern, handler, opts) => on(method, pattern, async (req, params) => handler(req, params, await requireMember(req, opts)));

  // Public
  on("GET", "/api/hub/join/:code", async (req, { code: c }) => {
    const g = await (await table("hub_groups")).one({ join_code: String(c).toUpperCase() });
    if (!g) return fail("That join code didn't work. Check it with your group leader.", 404);
    return json({ group: { name: g.name, kind: g.kind, members: (await activeMembers(g.id)).length } });
  });
  on("GET", "/api/hub/qr/:file", async (req, { file }) => {
    const c = file.replace(/\.png$/, "").toUpperCase();
    const png = await QRCode.toBuffer(`${HUB_URL()}/join/${c}`, { width: 360, margin: 1, color: { dark: "#13294B", light: "#FFFFFF" } });
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  });
  on("GET", "/api/hub/confirm/:tok", async (req, { tok }) => json(await supervisorView(tok)));
  on("POST", "/api/hub/confirm/:tok", async (req, { tok }) => json(await supervisorDecide(tok, (await body(req)).decision)));
  on("GET", "/api/hub/verify/:code", async (req, { code: c }) => json(await verifyTranscript(c)));
  on("POST", "/api/leads", async (req) => json(await saveLead(await body(req)), 201));

  // Members
  member("GET", "/api/hub/me", async (req, p, { user, profile }) => json({ email: user.email, profile }), { needProfile: false });
  member("POST", "/api/hub/me", async (req, p, { user }) => json({ profile: await saveProfile(user, await body(req)) }), { needProfile: false });
  member("GET", "/api/hub/home", async (req, p, { profile }) => json(await home(profile)));
  member("GET", "/api/hub/entries", async (req, p, { profile }) => json({ entries: await (await table("hub_entries")).list({ eq: { profile_id: profile.id }, order: "date", desc: true }) }));
  member("POST", "/api/hub/entries", async (req, p, { profile }) => json({ entry: await createEntry(profile, await body(req)) }, 201));
  member("DELETE", "/api/hub/entries/:id", async (req, { id }, { profile }) => { await deleteEntry(profile, id); return json({ ok: true }); });
  member("POST", "/api/hub/entries/:id/resend", async (req, { id }, { profile }) => { await resendSupervisor(profile, id); return json({ ok: true }); });
  member("POST", "/api/hub/entries/:id/photo", async (req, { id }, { profile }) => {
    const E = await table("hub_entries");
    const e = await E.get(id);
    if (!e || e.profile_id !== profile.id) return fail("Entry not found.", 404);
    const { content_type, data_base64 } = await body(req);
    if (!/^image\/(jpeg|png|webp)$/.test(content_type || "")) return fail("Upload a JPG, PNG or WebP photo.");
    const bytes = Buffer.from(String(data_base64 || ""), "base64");
    if (bytes.length > 4.5 * 1024 * 1024) return fail("That photo is too large. Try one under 4 MB.");
    const url = await (await getStore()).photos.upload(`hub/${profile.id}/${e.id}-${Date.now()}.${content_type.split("/")[1].replace("jpeg", "jpg")}`, bytes, content_type);
    return json({ entry: await E.update(e.id, { photo_url: url }) });
  });
  member("GET", "/api/hub/badges", async (req, p, { profile }) => json(personalBadges(await (await table("hub_entries")).list({ eq: { profile_id: profile.id } }))));
  member("POST", "/api/hub/groups", async (req, p, { profile }) => json({ group: await createGroup(profile, await body(req)) }, 201));
  member("POST", "/api/hub/join/:code", async (req, { code: c }, { profile }) => {
    const g = await (await table("hub_groups")).one({ join_code: String(c).toUpperCase() });
    if (!g) return fail("That join code didn't work. Check it with your group leader.", 404);
    await joinGroup(profile, g);
    return json({ group_id: g.id });
  });
  member("GET", "/api/hub/groups/:id", async (req, { id }, { profile }) => { const { group, member: m } = await requireGroup(id, profile); return json(await groupView(group, m, profile)); });
  member("PATCH", "/api/hub/groups/:id", async (req, { id }, { profile }) => { const { group } = await requireGroup(id, profile, { leader: true }); return json({ group: await updateGroup(group, await body(req)) }); });
  member("POST", "/api/hub/groups/:id/review", async (req, { id }, { profile }) => {
    const { group } = await requireGroup(id, profile, { leader: true });
    const f = await body(req);
    return json({ updated: (await review(group, profile, f.ids, f.action, f.note)).length });
  });
  member("PATCH", "/api/hub/groups/:id/members/:mid", async (req, { id, mid }, { profile }) => {
    const { group } = await requireGroup(id, profile, { leader: true });
    return json({ member: await setMember(group, mid, await body(req), profile.id) });
  });
  member("POST", "/api/hub/groups/:id/leave", async (req, { id }, { profile }) => {
    const { group, member: m } = await requireGroup(id, profile);
    if (m.role === "leader" && (await activeMembers(group.id)).filter((x) => x.role === "leader").length === 1 && (await activeMembers(group.id)).length > 1) return fail("Make someone else a leader before you leave.");
    await (await table("hub_members")).update(m.id, { status: "removed" });
    return json({ ok: true });
  });
  member("GET", "/api/hub/groups/:id/report", async (req, { id }, { profile }) => {
    const { group } = await requireGroup(id, profile, { leader: true });
    return json(await monthlyReport(group, new URL(req.url).searchParams.get("month")));
  });
  member("GET", "/api/hub/groups/:id/export", async (req, { id }, { profile }) => {
    const { group } = await requireGroup(id, profile, { leader: true });
    return new Response(await groupCsv(group), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${group.name.replace(/[^a-z0-9]+/gi, "-")}-hours.csv"` } });
  });
  member("GET", "/api/hub/transcripts", async (req, p, { profile }) => json({ access: await transcriptAccess(profile), transcripts: (await (await table("hub_transcripts")).list({ eq: { profile_id: profile.id }, desc: true })).map((t) => ({ code: t.code, created_at: t.created_at, total: t.snapshot.total, url: `${HUB_URL()}/verify/${t.code}` })) }));
  member("POST", "/api/hub/transcripts", async (req, p, { profile }) => { const t = await createTranscript(profile); return json({ code: t.code, url: `${HUB_URL()}/verify/${t.code}` }, 201); });

  // Dashboard (That's Just Good team)
  admin("GET", "/api/admin/hub", "view", async () => json(await adminHub()));
  admin("PATCH", "/api/admin/hub/groups/:id", "manage", async (req, { id }) => {
    const f = await body(req);
    if (f.plan && !GROUP_PLANS[f.plan]) return fail("Choose a plan.");
    return json({ group: await (await table("hub_groups")).update(id, { plan: f.plan }) });
  });
  admin("PATCH", "/api/admin/hub/people/:id", "manage", async (req, { id }) => {
    const f = await body(req);
    if (!["free", "verified"].includes(f.plan)) return fail("Choose a plan.");
    return json({ profile: await (await table("hub_profiles")).update(id, { plan: f.plan, plan_until: f.plan_until || null }) });
  });
  admin("GET", "/api/admin/leads", "view", async () => json({ leads: await (await table("leads")).list({ desc: true }) }));
  admin("PATCH", "/api/admin/leads/:id", "manage", async (req, { id }) => {
    const f = await body(req);
    const patch = {};
    if (f.status) { if (!["new", "contacted", "invited", "won", "lost"].includes(f.status)) return fail("Choose a status."); patch.status = f.status; }
    if ("notes" in f) patch.notes = clean(f.notes, 4000);
    return json({ lead: await (await table("leads")).update(id, patch) });
  });
  admin("POST", "/api/admin/leads/:id/invite", "manage", async (req, { id }) => {
    const L = await table("leads");
    const lead = await L.get(id);
    if (!lead) return fail("Lead not found.", 404);
    await hubInvite(lead);
    return json({ lead: await L.update(id, { status: "invited" }) });
  });
}
