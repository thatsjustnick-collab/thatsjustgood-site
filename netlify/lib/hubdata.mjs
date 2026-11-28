// Data access for My Impact Hub and website leads. Same pattern as store.mjs:
// Supabase in production, an in-memory stand-in for local development and tests.
import { randomUUID } from "node:crypto";
import { getStore } from "./store.mjs";

const TABLES = ["hub_profiles", "hub_groups", "hub_members", "hub_entries", "hub_transcripts", "leads"];
const now = () => new Date().toISOString();
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/**
 * table(name) -> { insert, get, update, remove, list({ eq, in, order, desc, limit }), one(eq) }
 * `eq` is an object of exact matches; `in` is { field: [values] }.
 */
export async function table(name) {
  if (!TABLES.includes(name)) throw new Error("Unknown table " + name);
  const store = await getStore();
  if (store.mode === "memory") {
    const db = store._db;
    db[name] ||= [];
    const match = (r, eq = {}, inn = {}) =>
      Object.entries(eq).every(([k, v]) => (v === null ? r[k] == null : k === "email" && typeof r[k] === "string" ? r[k].toLowerCase() === String(v).toLowerCase() : r[k] === v)) &&
      Object.entries(inn).every(([k, vs]) => vs.includes(r[k]));
    const list = async ({ eq, in: inn, order = "created_at", desc = false, limit } = {}) => {
      let rows = db[name].filter((r) => match(r, eq, inn));
      rows.sort((a, b) => String(a[order] ?? "").localeCompare(String(b[order] ?? "")) * (desc ? -1 : 1));
      if (limit) rows = rows.slice(0, limit);
      return clone(rows);
    };
    return {
      async insert(row) {
        const r = { id: randomUUID(), created_at: now(), updated_at: now(), ...clone(row) };
        if (name === "hub_members" && db[name].some((x) => x.group_id === r.group_id && x.profile_id === r.profile_id)) {
          const e = new Error("duplicate"); e.code = "23505"; throw e;
        }
        if (name === "hub_groups" && db[name].some((x) => x.join_code === r.join_code)) { const e = new Error("duplicate"); e.code = "23505"; throw e; }
        db[name].push(r);
        return clone(r);
      },
      get: async (id) => clone(db[name].find((r) => r.id === id) || null),
      one: async (eq) => clone(db[name].find((r) => match(r, eq)) || null),
      list,
      async update(id, patch) {
        const r = db[name].find((x) => x.id === id);
        if (!r) return null;
        Object.assign(r, clone(patch), { updated_at: now() });
        return clone(r);
      },
      async remove(id) { db[name] = db[name].filter((r) => r.id !== id); },
    };
  }
  const sb = store.client;
  const apply = (q, { eq = {}, in: inn = {} } = {}) => {
    for (const [k, v] of Object.entries(eq)) q = k === "email" ? q.ilike(k, v) : v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, vs] of Object.entries(inn)) q = q.in(k, vs);
    return q;
  };
  const chk = ({ data, error }) => { if (error) throw error; return data; };
  return {
    insert: async (row) => chk(await sb.from(name).insert(row).select().single()),
    get: async (id) => chk(await sb.from(name).select("*").eq("id", id).maybeSingle()),
    one: async (eq) => chk(await apply(sb.from(name).select("*"), { eq }).limit(1).maybeSingle()),
    list: async ({ eq, in: inn, order = "created_at", desc = false, limit } = {}) => {
      let q = apply(sb.from(name).select("*"), { eq, in: inn }).order(order, { ascending: !desc });
      if (limit) q = q.limit(limit);
      return chk(await q) || [];
    },
    update: async (id, patch) => chk(await sb.from(name).update({ ...patch, updated_at: now() }).eq("id", id).select().single()),
    remove: async (id) => { chk(await sb.from(name).delete().eq("id", id)); },
  };
}
