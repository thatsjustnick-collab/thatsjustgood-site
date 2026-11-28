// My Impact Hub flows against the in-memory stand-ins. Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.URL = "http://localhost:8888";
delete process.env.SUPABASE_URL; delete process.env.BREVO_API_KEY;

const { default: api } = await import("../netlify/functions/api.mjs");
const { resetMemoryStore } = await import("../netlify/lib/store.mjs");
const { getOutbox, clearOutbox } = await import("../netlify/lib/notify.mjs");
const { personalBadges } = await import("../netlify/lib/badges.mjs");

const call = async (method, path, data, who) => {
  const res = await api(new Request("http://localhost:8888" + path, {
    method,
    headers: { "content-type": "application/json", ...(who ? { authorization: who === "admin" ? "Bearer dev-admin" : `Bearer dev-member:${who}` } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  }));
  const type = res.headers.get("content-type") || "";
  return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
};
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

beforeEach(() => { resetMemoryStore(); clearOutbox(); });

test("sign-in and profile setup", async () => {
  assert.equal((await call("GET", "/api/hub/home")).status, 401);
  assert.equal((await call("GET", "/api/hub/home", null, "maya@example.com")).status, 409);
  assert.equal((await call("POST", "/api/hub/me", { name: "Maya Rivera" }, "maya@example.com")).status, 400, "13+ confirmation required");
  const r = await call("POST", "/api/hub/me", { name: "Maya Rivera", age_ok: true, grad_year: 2028 }, "maya@example.com");
  assert.equal(r.status, 200);
  const h = await call("GET", "/api/hub/home", null, "maya@example.com");
  assert.equal(h.status, 200);
  assert.equal(h.data.totals.verified, 0);
});

test("group, supervisor confirmation, leader approval, report and transcript", async () => {
  await call("POST", "/api/hub/me", { name: "Ms. Carter", age_ok: true }, "carter@lincoln.org");
  await call("POST", "/api/hub/me", { name: "Maya Rivera", age_ok: true }, "maya@example.com");
  const g = (await call("POST", "/api/hub/groups", { name: "Lincoln High NHS", kind: "chapter", goal_hours: 1500, per_member_hours: 20 }, "carter@lincoln.org")).data.group;
  assert.ok(g.join_code);
  assert.equal((await call("GET", `/api/hub/join/${g.join_code}`)).data.group.name, "Lincoln High NHS");
  assert.equal((await call("POST", `/api/hub/join/${g.join_code}`, {}, "maya@example.com")).status, 200);

  // Log with a supervisor: email goes out, then the supervisor confirms with one click
  const bad = await call("POST", "/api/hub/entries", { activity: "Food bank", date: day(2), hours: 3 }, "maya@example.com");
  assert.equal(bad.status, 400, "honor code required");
  const e = (await call("POST", "/api/hub/entries", { activity: "Food bank sorting", org_name: "Community Food Bank", cause: "hunger", date: day(2), hours: 3, group_id: g.id, supervisor_name: "Dana", supervisor_email: "dana@foodbank.org", honor: true }, "maya@example.com")).data.entry;
  assert.equal(e.status, "awaiting_supervisor");
  const mail = getOutbox().find((m) => m.to === "dana@foodbank.org");
  assert.ok(mail && /confirm/i.test(mail.subject));
  assert.equal((await call("GET", `/api/hub/confirm/${e.verify_token}`)).data.name, "Maya Rivera");
  assert.equal((await call("POST", `/api/hub/confirm/${e.verify_token}`, { decision: "confirm" })).data.status, "verified");

  // A future date is rejected
  assert.equal((await call("POST", "/api/hub/entries", { activity: "x", date: day(-3), hours: 1, honor: true }, "maya@example.com")).status, 400);

  // Leader sees the queue and approves; members can't
  assert.equal((await call("POST", `/api/hub/groups/${g.id}/review`, { ids: [e.id], action: "approve" }, "maya@example.com")).status, 403);
  const gv = (await call("GET", `/api/hub/groups/${g.id}`, null, "carter@lincoln.org")).data;
  assert.equal(gv.queue.length, 1);
  assert.equal((await call("POST", `/api/hub/groups/${g.id}/review`, { ids: [e.id], action: "approve" }, "carter@lincoln.org")).data.updated, 1);
  const after = (await call("GET", `/api/hub/groups/${g.id}`, null, "maya@example.com")).data;
  assert.equal(after.total_hours, 3);
  assert.equal(after.roster, undefined, "members don't see the roster");

  const rep = (await call("GET", `/api/hub/groups/${g.id}/report?month=${day(2).slice(0, 7)}`, null, "carter@lincoln.org")).data;
  assert.equal(rep.hours, 3);
  assert.equal(rep.top[0].name, "Maya Rivera");
  const csv = await call("GET", `/api/hub/groups/${g.id}/export`, null, "carter@lincoln.org");
  assert.match(csv.data, /Food bank sorting/);

  // Transcripts need a paid plan: starter group doesn't qualify
  assert.equal((await call("POST", "/api/hub/transcripts", {}, "maya@example.com")).status, 402);
  const people = (await call("GET", "/api/admin/hub", null, "admin")).data.people;
  const maya = people.find((p) => p.email === "maya@example.com");
  assert.equal((await call("PATCH", `/api/admin/hub/people/${maya.id}`, { plan: "verified" }, "admin")).status, 200);
  const t = (await call("POST", "/api/hub/transcripts", {}, "maya@example.com")).data;
  assert.match(t.code, /^TJG-/);
  const v = (await call("GET", `/api/hub/verify/${t.code}`)).data;
  assert.equal(v.total, 3);
  assert.equal(v.name, "Maya Rivera");
});

test("starter groups cap at 25 members and leaders can't exceed plan", async () => {
  await call("POST", "/api/hub/me", { name: "Lead", age_ok: true }, "lead@x.org");
  const g = (await call("POST", "/api/hub/groups", { name: "Club" }, "lead@x.org")).data.group;
  for (let i = 0; i < 24; i++) {
    await call("POST", "/api/hub/me", { name: "M" + i, age_ok: true }, `m${i}@x.org`);
    assert.equal((await call("POST", `/api/hub/join/${g.join_code}`, {}, `m${i}@x.org`)).status, 200);
  }
  await call("POST", "/api/hub/me", { name: "Extra", age_ok: true }, "extra@x.org");
  assert.equal((await call("POST", `/api/hub/join/${g.join_code}`, {}, "extra@x.org")).status, 400);
  const roster = (await call("GET", `/api/hub/groups/${g.id}`, null, "lead@x.org")).data.roster;
  const someone = roster.find((r) => r.role === "member");
  assert.equal((await call("PATCH", `/api/hub/groups/${g.id}/members/${someone.member_id}`, { role: "leader" }, "lead@x.org")).status, 400);
});

test("work email domains join their group automatically", async () => {
  await call("POST", "/api/hub/me", { name: "HR Lead", age_ok: true }, "hr@acme.com");
  const g = (await call("POST", "/api/hub/groups", { name: "Acme Gives", kind: "company" }, "hr@acme.com")).data.group;
  assert.equal((await call("PATCH", `/api/hub/groups/${g.id}`, { email_domain: "gmail.com" }, "hr@acme.com")).status, 400);
  await call("PATCH", `/api/hub/groups/${g.id}`, { email_domain: "acme.com" }, "hr@acme.com");
  await call("POST", "/api/hub/me", { name: "Sam", age_ok: true }, "sam@acme.com");
  const home = (await call("GET", "/api/hub/home", null, "sam@acme.com")).data;
  assert.equal(home.groups[0]?.name, "Acme Gives");
});

test("badges count verified hours only", () => {
  const e = (date, hours, cause, status = "verified") => ({ date, hours, cause, status, approval: null });
  const b = personalBadges([e("2026-01-19", 6, "hunger"), e("2026-02-07", 5, "hunger"), e("2026-03-07", 2, "education"), e("2026-04-04", 50, "education", "unverified")]);
  const got = (c) => b.badges.find((x) => x.code === c).earned;
  assert.equal(b.total, 13);
  assert.ok(got("hours-10"));
  assert.ok(!got("hours-25"));
  assert.ok(got("cause-hunger"));
  assert.ok(!got("cause-education"), "unverified hours don't count");
  assert.ok(got("streak-3"));
  assert.ok(got("day-mlk"), "Jan 19, 2026 is MLK Day");
});

test("website leads are saved for the dashboard and can be invited", async () => {
  assert.equal((await call("POST", "/api/leads", { "form-name": "hub-waitlist", name: "Jordan", email: "jordan@example.com", joining_as: "Group or chapter leader" })).status, 201);
  assert.equal((await call("POST", "/api/leads", { "form-name": "impact-partners", name: "Riley", email: "riley@northwind.com", company: "Northwind", employees: "251 to 500" })).status, 201);
  const leads = (await call("GET", "/api/admin/leads", null, "admin")).data.leads;
  assert.equal(leads.length, 2);
  const wl = leads.find((l) => l.kind === "hub_waitlist");
  assert.equal((await call("POST", `/api/admin/leads/${wl.id}/invite`, {}, "admin")).data.lead.status, "invited");
  assert.ok(getOutbox().some((m) => m.to === "jordan@example.com"));
  assert.equal(leads.find((l) => l.kind === "partners").organization, "Northwind");
});
