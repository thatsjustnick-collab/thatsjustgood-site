// That's Just Good pricing and booking rules.
// Shared by the website planner (copied to /assets/pricing.js) and the back end, so both always agree.
// To change a price or rule, edit it here and redeploy.

export const RULES = {
  depositPercent: 50,          // share of the total due at booking to lock the date
  balanceDueDaysBefore: 7,     // balance invoice is due this many days before the event
  freeRescheduleDays: 14,      // free reschedule up to this many days before
  refundableUntilDays: 30,     // deposit refundable until this many days before
  minLeadDays: 21,             // book at least this many days ahead
  minGroup: 10,
  maxGroup: 300,
  travelIncludedMiles: 30,     // from Dallas
};

// Host Only: That's Just Good hosts and runs the event; the client supplies the materials.
export const HOST_ONLY_CENTS = { 90: 125000, 120: 150000, 180: 200000 };

// All-Inclusive: host fee plus supplies per person. Set perPersonCents to turn on instant estimates.
// While it's null, the planner asks for a quote and Nick sets the price in the dashboard.
export const ALL_INCLUSIVE = {
  perPersonCents: null,
  minimumCents: null,
};

export const DURATIONS = [
  { minutes: 90, label: "90 minutes" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "Up to 3 hours" },
];

export const CAUSES = [
  "Childhood hunger", "First responders", "Children's hospitals", "Teachers & educators",
  "Homelessness", "Active military", "Orphans & foster children", "Adults with disabilities",
  "Cancer survivors", "School supplies", "Pet rescue", "Something else",
];

export const CHIP_IN_CENTS = [1000, 2500, 5000];

export const money = (cents) =>
  cents == null ? "" : "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Estimate a team building event. Returns totals in cents, or quote:true when a custom quote is needed. */
export function estimate({ format, minutes, groupSize }) {
  const host = HOST_ONLY_CENTS[minutes];
  const size = Number(groupSize) || 0;
  if (!host) return { quote: true, reason: "Choose an event length." };
  if (format === "host_only") {
    const total = host;
    return { quote: false, total, deposit: Math.round((total * RULES.depositPercent) / 100),
             lines: [{ label: `Host Only, ${DURATIONS.find(d => d.minutes === minutes).label}`, cents: host }] };
  }
  if (ALL_INCLUSIVE.perPersonCents == null) {
    return { quote: true, hostFee: host, reason: "All-Inclusive pricing depends on your group size and cause, so we'll send a custom quote within 1 business day." };
  }
  const supplies = ALL_INCLUSIVE.perPersonCents * size;
  const total = Math.max(host + supplies, ALL_INCLUSIVE.minimumCents || 0);
  return { quote: false, total, deposit: Math.round((total * RULES.depositPercent) / 100),
           lines: [{ label: "Host fee", cents: host }, { label: `Supplies for ${size} people`, cents: supplies }] };
}

/** Earliest bookable date (YYYY-MM-DD) given today's date. */
export function earliestDate(now = new Date()) {
  const d = new Date(now.getTime() + RULES.minLeadDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Validate a booking request. Returns a list of plain-language problems (empty when valid). */
export function validateBooking(b, now = new Date()) {
  const errs = [];
  if (!b.org_name) errs.push("Add your company or group name.");
  if (!b.contact_name) errs.push("Add your name.");
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) errs.push("Add a valid email address.");
  if (!["host_only", "all_inclusive"].includes(b.format)) errs.push("Choose Host Only or All-Inclusive.");
  if (!HOST_ONLY_CENTS[b.duration_min]) errs.push("Choose an event length.");
  const g = Number(b.group_size);
  if (!g || g < RULES.minGroup || g > RULES.maxGroup) errs.push(`Group size must be between ${RULES.minGroup} and ${RULES.maxGroup}. For larger groups, contact us.`);
  if (!b.preferred_date) errs.push("Choose a date.");
  else if (b.preferred_date < earliestDate(now)) errs.push(`Please choose a date at least ${RULES.minLeadDays} days from today.`);
  if (!b.cause) errs.push("Pick a cause.");
  return errs;
}
