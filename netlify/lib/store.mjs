// Data access for events, RSVPs, bookings, feedback and team members.
// Uses Supabase in production. When Supabase isn't configured (local development and tests),
// it falls back to an in-memory store so every flow can be exercised without outside services.
import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

export function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/* ---------------- In-memory store (development and tests only) ---------------- */
function memoryStore() {
  const db = globalThis.__TJG_DB || (globalThis.__TJG_DB = { events: [], rsvps: [], bookings: [], feedback: [], team: [], photos: {} });
  const table = (name, defaults = {}) => ({
    async insert(row) {
      const r = { id: randomUUID(), created_at: now(), updated_at: now(), ...defaults, ...clone(row) };
      db[name].push(r);
      return clone(r);
    },
    async get(id) { return clone(db[name].find((r) => r.id === id) || null); },
    async findBy(field, value) { return clone(db[name].find((r) => r[field] === value) || null); },
    async where(fn) { return clone(db[name].filter(fn)); },
    async update(id, patch) {
      const r = db[name].find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, clone(patch), { updated_at: now() });
      return clone(r);
    },
    async remove(id) { db[name] = db[name].filter((r) => r.id !== id); },
  });
  const events = table("events", { status: "draft", waitlist: true, allow_chip_in: false, impact: {} });
  const rsvps = table("rsvps", { status: "going", party_size: 1, sms_opt_in: false, email_opt_in: true });
  const bookings = table("bookings", { status: "requested" });
  const feedback = table("feedback");
  return {
    mode: "memory",
    events: {
      list: ({ kinds, statuses, fromIso } = {}) =>
        events.where((e) => (!kinds || kinds.includes(e.kind)) && (!statuses || statuses.includes(e.status)) && (!fromIso || e.ends_at >= fromIso))
          .then((r) => r.sort((a, b) => a.starts_at.localeCompare(b.starts_at))),
      get: events.get, bySlug: (s) => events.findBy("slug", s), byReportToken: (t) => events.findBy("report_token", t),
      insert: (r) => {
        if (db.events.some((e) => e.slug === r.slug)) throw new Error("duplicate slug");
        return events.insert(r);
      },
      update: events.update, remove: events.remove,
    },
    rsvps: {
      insert: (r) => {
        if (db.rsvps.some((x) => x.event_id === r.event_id && x.status !== "cancelled" && x.email.toLowerCase() === r.email.toLowerCase())) {
          const e = new Error("duplicate"); e.code = "23505"; throw e;
        }
        return rsvps.insert(r);
      },
      get: rsvps.get, byToken: (t) => rsvps.findBy("token", t),
      byEvent: (id) => rsvps.where((r) => r.event_id === id).then((r) => r.sort((a, b) => a.created_at.localeCompare(b.created_at))),
      update: rsvps.update,
    },
    bookings: {
      insert: bookings.insert, get: bookings.get, update: bookings.update,
      byRef: (v) => bookings.findBy("ref", v), byPortal: (v) => bookings.findBy("portal_code", v),
      byOrganizer: (v) => bookings.findBy("organizer_token", v), byCheckout: (v) => bookings.findBy("stripe_checkout_id", v),
      list: () => bookings.where(() => true).then((r) => r.sort((a, b) => b.created_at.localeCompare(a.created_at))),
    },
    feedback: { insert: feedback.insert, byEvent: (id) => feedback.where((f) => f.event_id === id) },
    team: {
      list: async () => clone(db.team),
      get: async (userId) => clone(db.team.find((t) => t.user_id === userId) || null),
      byEmail: async (email) => clone(db.team.find((t) => t.email.toLowerCase() === email.toLowerCase()) || null),
      upsert: async (row) => {
        const i = db.team.findIndex((t) => t.user_id === row.user_id);
        if (i >= 0) db.team[i] = { ...db.team[i], ...row }; else db.team.push({ created_at: now(), ...row });
        return clone(row);
      },
      remove: async (userId) => { db.team = db.team.filter((t) => t.user_id !== userId); },
    },
    photos: {
      async upload(path, bytes, contentType) {
        db.photos[path] = { contentType, size: bytes.length };
        return `/dev-photos/${path}`;
      },
    },
    _db: db,
  };
}

/* ---------------- Supabase store (production) ---------------- */
async function supabaseStore() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const one = async (q) => { const { data, error } = await q.maybeSingle(); if (error) throw error; return data; };
  const many = async (q) => { const { data, error } = await q; if (error) throw error; return data || []; };
  const ins = async (t, row) => { const { data, error } = await sb.from(t).insert(row).select().single(); if (error) throw error; return data; };
  const upd = async (t, id, patch) => {
    const { data, error } = await sb.from(t).update({ ...patch, updated_at: now() }).eq("id", id).select().single();
    if (error) throw error; return data;
  };
  return {
    mode: "supabase",
    client: sb,
    events: {
      list: ({ kinds, statuses, fromIso } = {}) => {
        let q = sb.from("events").select("*").order("starts_at", { ascending: true });
        if (kinds) q = q.in("kind", kinds);
        if (statuses) q = q.in("status", statuses);
        if (fromIso) q = q.gte("ends_at", fromIso);
        return many(q);
      },
      get: (id) => one(sb.from("events").select("*").eq("id", id)),
      bySlug: (s) => one(sb.from("events").select("*").eq("slug", s)),
      byReportToken: (t) => one(sb.from("events").select("*").eq("report_token", t)),
      insert: (r) => ins("events", r),
      update: (id, p) => upd("events", id, p),
      remove: async (id) => { const { error } = await sb.from("events").delete().eq("id", id); if (error) throw error; },
    },
    rsvps: {
      insert: (r) => ins("rsvps", r),
      get: (id) => one(sb.from("rsvps").select("*").eq("id", id)),
      byToken: (t) => one(sb.from("rsvps").select("*").eq("token", t)),
      byEvent: (id) => many(sb.from("rsvps").select("*").eq("event_id", id).order("created_at")),
      update: (id, p) => upd("rsvps", id, p),
    },
    bookings: {
      insert: (r) => ins("bookings", r),
      get: (id) => one(sb.from("bookings").select("*").eq("id", id)),
      update: (id, p) => upd("bookings", id, p),
      byRef: (v) => one(sb.from("bookings").select("*").eq("ref", v)),
      byPortal: (v) => one(sb.from("bookings").select("*").eq("portal_code", v)),
      byOrganizer: (v) => one(sb.from("bookings").select("*").eq("organizer_token", v)),
      byCheckout: (v) => one(sb.from("bookings").select("*").eq("stripe_checkout_id", v)),
      list: () => many(sb.from("bookings").select("*").order("created_at", { ascending: false })),
    },
    feedback: {
      insert: (r) => ins("feedback", r),
      byEvent: (id) => many(sb.from("feedback").select("*").eq("event_id", id).order("created_at")),
    },
    team: {
      list: () => many(sb.from("team_members").select("*").order("created_at")),
      get: (userId) => one(sb.from("team_members").select("*").eq("user_id", userId)),
      byEmail: (email) => one(sb.from("team_members").select("*").ilike("email", email)),
      upsert: async (row) => { const { data, error } = await sb.from("team_members").upsert(row).select().single(); if (error) throw error; return data; },
      remove: async (userId) => { const { error } = await sb.from("team_members").delete().eq("user_id", userId); if (error) throw error; },
    },
    photos: {
      async upload(path, bytes, contentType) {
        const { error } = await sb.storage.from("event-photos").upload(path, bytes, { contentType, upsert: true });
        if (error) throw error;
        return sb.storage.from("event-photos").getPublicUrl(path).data.publicUrl;
      },
    },
  };
}

let cached;
export async function getStore() {
  if (cached) return cached;
  if (isConfigured()) cached = await supabaseStore();
  else if (process.env.CONTEXT === "production" || process.env.TJG_REQUIRE_DB === "1") {
    const e = new Error("The events system isn't connected yet. Add the Supabase keys in Netlify.");
    e.status = 503; throw e;
  } else cached = memoryStore();
  return cached;
}

export function resetMemoryStore() {
  globalThis.__TJG_DB = undefined;
  cached = undefined;
}
