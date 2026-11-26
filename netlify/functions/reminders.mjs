// Runs every hour: sends day-before reminders (email, plus text for people who opted in)
// and the organizer's headcount email for company events.
import { runReminders } from "../lib/services.mjs";
import { isConfigured } from "../lib/store.mjs";

export default async () => {
  if (!isConfigured()) return new Response("Events system not connected yet", { status: 200 });
  const result = await runReminders();
  console.log("reminders", result);
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "@hourly" };
