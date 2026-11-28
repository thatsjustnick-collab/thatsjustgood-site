// My Impact Hub badges, earned from verified hours only (never from dollar amounts).
// Shared by the server (to award) and the app (to show what's next).

export const HUB_CAUSES = [
  ["hunger", "Hunger", "HUNGER", "Hunger Fighter"],
  ["education", "Education", "LEARN", "Education Champion"],
  ["environment", "Environment", "EARTH", "Earth Keeper"],
  ["animals", "Animals", "PAWS", "Animal Ally"],
  ["health", "Health", "HEALTH", "Health Helper"],
  ["seniors", "Seniors", "ELDERS", "Senior Friend"],
  ["kids", "Kids and youth", "KIDS", "Kid Champion"],
  ["housing", "Housing", "HOME", "Home Builder"],
  ["relief", "Disaster relief", "RELIEF", "First Responder"],
  ["arts", "Arts and culture", "ARTS", "Arts Ally"],
  ["other", "Something else", null, null],
];

const MILESTONES = [
  [1, "1", "First Good", "spark"], [10, "10", "Getting Started", "spark"], [25, "25", "Quarter Century", "spark"],
  [50, "50", "Halfway Hero", "shine"], [100, "100", "Century", "shine"], [250, "250", "Changemaker", "glow"],
  [500, "500", "Force for Good", "glow"], [1000, "1K", "Legend", "legend"], [2500, "2.5K", "Lifetime of Good", "legend"], [4000, "4K", "Hall of Good", "legend"],
];

const pad = (n) => String(n).padStart(2, "0");
function nthWeekday(year, month, weekday, n) { // month 1-12, weekday 0=Sun
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
function specialDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (m === 1 && d === nthWeekday(y, 1, 1, 3)) return "mlk";
  if (m === 4 && d === 22) return "earth";
  if (m === 9 && d === 11) return "911";
  const gt = new Date(Date.UTC(y, 10, nthWeekday(y, 11, 4, 4) + 5)); // Tuesday after Thanksgiving
  if (m === gt.getUTCMonth() + 1 && d === gt.getUTCDate()) return "giving";
  if (m === 12) return "december";
  return null;
}
const DAYS = { mlk: ["MLK", "MLK Day of Service", "Serve on MLK Day"], earth: ["4/22", "Earth Day", "Serve on Earth Day"], "911": ["9/11", "9/11 Day of Service", "Serve on September 11"], giving: ["GIVE", "GivingTuesday", "Serve on GivingTuesday"], december: ["DEC", "Holiday Helper", "Serve during December"] };

export const isVerified = (e) => e.status === "verified" || e.approval === "approved";

/** Every badge with earned true/false and progress, for one person's entries. */
export function personalBadges(entries) {
  const v = entries.filter(isVerified);
  const total = v.reduce((s, e) => s + Number(e.hours), 0);
  const out = [];
  for (const [n, label, name, tier] of MILESTONES) out.push({ code: `hours-${n}`, group: "Milestones", label, name, tier, how: n === 1 ? "Your first verified hour" : `${n.toLocaleString("en-US")} verified hours`, earned: total >= n, progress: Math.min(1, total / n) });

  const byCause = {};
  for (const e of v) if (e.cause) byCause[e.cause] = (byCause[e.cause] || 0) + Number(e.hours);
  for (const [code, label, short, name] of HUB_CAUSES) {
    if (!short) continue;
    const h = byCause[code] || 0;
    out.push({ code: `cause-${code}`, group: "Causes", label: short, name, tier: "cause", how: `10 hours helping with ${label.toLowerCase()}`, earned: h >= 10, progress: Math.min(1, h / 10), stars: h >= 100 ? 3 : h >= 50 ? 2 : h >= 10 ? 1 : 0 });
  }
  const causes10 = Object.values(byCause).filter((h) => h >= 10).length;
  out.push({ code: "causes-3", group: "Causes", label: "3X", name: "3 Causes Strong", tier: "spark", how: "10 hours in 3 different causes", earned: causes10 >= 3, progress: Math.min(1, causes10 / 3) });
  out.push({ code: "causes-5", group: "Causes", label: "5X", name: "Cause Explorer", tier: "shine", how: "10 hours in 5 different causes", earned: causes10 >= 5, progress: Math.min(1, causes10 / 5) });

  // Consistency: longest run of months in a row with verified service
  const months = [...new Set(v.map((e) => e.date.slice(0, 7)))].sort();
  let best = 0, run = 0, prev = null;
  for (const m of months) {
    const [y, mo] = m.split("-").map(Number);
    const p = prev ? prev.split("-").map(Number) : null;
    run = p && (y * 12 + mo) - (p[0] * 12 + p[1]) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = m;
  }
  for (const [n, label, name] of [[3, "3MO", "Show Up"], [6, "6MO", "Steady"], [12, "12MO", "Every Month"]]) out.push({ code: `streak-${n}`, group: "Consistency", label, name, tier: "streak", how: `Serve ${n} months in a row`, earned: best >= n, progress: Math.min(1, best / n) });
  const weekends = v.filter((e) => [0, 6].includes(new Date(e.date + "T12:00:00Z").getUTCDay())).length;
  out.push({ code: "weekend-10", group: "Consistency", label: "SAT", name: "Weekend Warrior", tier: "streak", how: "10 weekend shifts", earned: weekends >= 10, progress: Math.min(1, weekends / 10) });

  const days = new Set(v.map((e) => specialDay(e.date)).filter(Boolean));
  for (const [k, [label, name, how]] of Object.entries(DAYS)) out.push({ code: `day-${k}`, group: "Days of Service", label, name, tier: "day", how, earned: days.has(k), progress: days.has(k) ? 1 : 0 });
  return { total, badges: out, earnedCount: out.filter((b) => b.earned).length };
}

/** Group badges from approved hours. */
export function groupBadges(totalHours, members, activeIds) {
  const out = [500, 1000, 5000].map((n) => ({ code: `group-${n}`, label: n >= 1000 ? `${n / 1000}K` : String(n), name: `Chapter ${n >= 1000 ? n / 1000 + "K" : n}`, how: `Your group logs ${n.toLocaleString("en-US")} hours`, earned: totalHours >= n, progress: Math.min(1, totalHours / n) }));
  const full = members > 0 && activeIds >= members;
  out.push({ code: "group-full", label: "100%", name: "Full House", how: "Every member has approved hours", earned: full, progress: members ? Math.min(1, activeIds / members) : 0 });
  return out;
}

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
