// Dashboard sign-in. People sign in with an emailed magic link (Supabase Auth); the site's server
// checks their token and their role on every request.
//   owner: everything, including adding and removing team members
//   admin: everything except managing the team
//   staff: view events and RSVPs, check people in, enter impact numbers
import { getStore, isConfigured } from "./store.mjs";

export const CAN = {
  view: ["owner", "admin", "staff"],
  checkin: ["owner", "admin", "staff"],
  impact: ["owner", "admin", "staff"],
  manage: ["owner", "admin"],
  team: ["owner"],
};

const owners = () => (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Returns { user, member } or throws { status: 401/403 }. */
export async function requireAdmin(req, action = "view") {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) throw Object.assign(new Error("Please sign in."), { status: 401 });
  const store = await getStore();

  let member;
  if (!isConfigured()) {
    if (jwt !== "dev-admin") throw Object.assign(new Error("Please sign in."), { status: 401 });
    member = { user_id: "dev", email: "dev@thatsjustgood.com", name: "Dev Owner", role: "owner" };
  } else {
    const { data, error } = await store.client.auth.getUser(jwt);
    if (error || !data?.user) throw Object.assign(new Error("Your sign-in expired. Please sign in again."), { status: 401 });
    const user = data.user;
    member = await store.team.get(user.id);
    if (!member && owners().includes((user.email || "").toLowerCase())) {
      member = await store.team.upsert({ user_id: user.id, email: user.email, name: user.user_metadata?.name || null, role: "owner" });
    }
    if (!member) {
      // Invited by email before they first signed in
      const invited = await store.team.byEmail(user.email);
      if (invited && invited.user_id !== user.id) {
        await store.team.remove(invited.user_id);
        member = await store.team.upsert({ ...invited, user_id: user.id });
      }
    }
    if (!member) throw Object.assign(new Error("This account doesn't have dashboard access. Ask the owner to add you."), { status: 403 });
  }
  if (!CAN[action].includes(member.role)) throw Object.assign(new Error("Your role can't do that. Ask an owner or admin."), { status: 403 });
  return { member };
}
