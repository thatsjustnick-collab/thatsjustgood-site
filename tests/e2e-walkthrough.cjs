// Browser walkthrough of every events flow against the local dev server. Saves screenshots to argv[2].
const { chromium } = require("playwright");
const OUT = process.argv[2];
const BASE = "http://localhost:8888";
const log = (...a) => console.log(...a);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|jsdelivr|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const shot = (n, full = true) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });

  // 1. Home shows upcoming events
  await page.goto(BASE + "/"); await page.waitForSelector("[data-upcoming] .event-card");
  log("home cards:", await page.locator("[data-upcoming] .event-card").count());

  // 2. Community calendar -> event -> RSVP
  await page.goto(BASE + "/community"); await page.waitForSelector("#popup-list .event-card");
  await page.locator("#popup-list").screenshot({ path: `${OUT}/01-community-list.png` });
  await page.locator("#popup-list .event-card").first().click();
  await page.waitForSelector("#ev-form");
  await shot("02-event-page");
  await page.fill("#ev-name", "Jordan Rivers"); await page.fill("#ev-email", "jordan@example.com"); await page.selectOption("#ev-party", "2");
  await page.click("#ev-form [type=submit]");
  await page.waitForSelector("#rsvp-area .pill");
  log("rsvp result:", await page.locator("#rsvp-area h2").innerText());
  await page.locator("#rsvp-area").screenshot({ path: `${OUT}/03-rsvp-done.png` });

  // 3. Manage RSVP: change party size, cancel flow (confirm UI only)
  await page.click("text=View or change my RSVP");
  await page.waitForSelector("#party-form");
  await page.selectOption("#party", "3"); await page.click("#party-form [type=submit]");
  await page.waitForSelector(".alert.success");
  log("party updated:", await page.locator(".alert.success").innerText());
  await shot("04-manage-rsvp");
  const rsvpUrl = page.url();

  // 4. Planner -> deposit -> confirmed booking
  await page.goto(BASE + "/plan"); await page.waitForSelector("#estimate .total");
  log("default estimate:", await page.locator("#estimate .total").innerText());
  await page.click("label.chip-option:has-text('Childhood hunger')");
  await page.fill("#p-size", "45");
  const d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await page.fill("#p-date", d);
  await page.fill("#p-addr", "2100 Ross Ave, Dallas, TX");
  await page.fill("#p-org", "Northwind Health"); await page.fill("#p-name", "Riley Chen"); await page.fill("#p-email", "riley@northwind.com"); await page.fill("#p-phone", "214-555-0144");
  await shot("05-planner-host-only");
  await page.click("label.option:has-text('All-Inclusive')");
  log("all-inclusive estimate:", await page.locator("#estimate .total").innerText());
  await page.click("label.option:has-text('Host Only')");
  await page.click("label.option:has-text('90 minutes')");
  log("90 min estimate:", await page.locator("#estimate .total").innerText());
  // try a missing field first to see validation
  await page.fill("#p-org", "");
  await page.click("#estimate [data-pay='1']");
  log("validation:", (await page.locator("#estimate .alert").innerText()).replace(/\s+/g, " "));
  await page.fill("#p-org", "Northwind Health");
  await Promise.all([page.waitForURL(/\/booking\?/), page.click("#estimate [data-pay='1']")]);
  await page.waitForSelector("h1:has-text('booked')", { timeout: 15000 });
  await shot("06-booking-confirmed");
  const teamUrl = await page.locator(".copy-box code").first().innerText();
  const orgUrl = await page.locator(".copy-box code").nth(1).innerText();
  log("team url:", teamUrl);

  // 5. Employee RSVP + organizer view
  await page.goto(teamUrl.replace("http://localhost:8888", BASE)); await page.waitForSelector("#tm-form");
  await page.fill("#tm-name", "Sam Ortiz"); await page.fill("#tm-email", "sam@northwind.com");
  await page.click("#tm-form [type=submit]"); await page.waitForSelector("#rsvp-area .pill");
  await shot("07-team-page");
  await page.goto(orgUrl.replace("http://localhost:8888", BASE)); await page.waitForSelector(".meter");
  log("organizer sees:", await page.locator(".table tbody tr").count(), "rsvp row(s)");
  await shot("08-organizer-view");

  // 6. Admin
  await page.goto(BASE + "/admin"); await page.click("#dev-in");
  await page.waitForSelector(".kpi");
  await shot("09-admin-overview");
  await page.click("text=Winter Blanket Drive Pop-Up >> nth=0");
  await page.waitForSelector("text=Check-in mode");
  await page.locator(".toggle-in").first().click();
  await page.waitForSelector(".toggle-in:has-text('Checked in')");
  await page.fill(".i-count", "312"); await page.fill(".i-label", "blankets made");
  await page.fill("#i-partner", "The Bridge Homeless Recovery Center"); await page.fill("#i-sum", "Forty neighbors turned a Saturday morning into 312 warm blankets.");
  await page.click("#save-impact"); await page.waitForSelector(".toast");
  await shot("10-admin-event");
  await page.click("#publish-rep"); await page.waitForSelector("text=Published");
  const reportUrl = await page.locator(".copy-box code").last().innerText();
  log("report:", reportUrl);
  // bookings tab
  await page.click("#tabs >> text=Bookings"); await page.waitForSelector(".table");
  await shot("11-admin-bookings");
  // new event form
  await page.goto(BASE + "/admin#new"); await page.waitForSelector("#ev-form");
  await shot("12-admin-new-event");
  // check-in mode
  await page.goto(BASE + "/admin#events"); await page.waitForSelector(".table");
  await page.click("text=Winter Blanket Drive Pop-Up >> nth=0"); await page.click("text=Check-in mode");
  await page.waitForSelector("#ci-search"); await page.fill("#ci-search", "jor");
  await shot("13-admin-checkin", false);

  // 7. Report + feedback + certificate
  await page.goto(reportUrl.replace("http://localhost:8888", BASE)); await page.waitForSelector(".impact-stat");
  await page.click(".stars label:nth-child(5)"); await page.fill("#fb-c", "Best team event we've done.");
  await page.click("#fb-form [type=submit]"); await page.waitForSelector("#fb-form .alert.success");
  await shot("14-report");
  const tok = rsvpUrl.split("/").pop();
  await page.goto(`${BASE}/certificate/${tok}`); await page.waitForSelector(".certificate");
  await shot("15-certificate", false);

  // 8. Mobile views
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE + "/plan"); await m.waitForSelector("#estimate .total"); await m.screenshot({ path: `${OUT}/16-mobile-planner.png`, fullPage: true });
  await m.goto(BASE + "/community"); await m.waitForSelector(".event-card"); await m.locator("#popup-list").screenshot({ path: `${OUT}/17-mobile-list.png` });
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  log("mobile horizontal overflow:", ov);

  const outbox = await (await fetch(BASE + "/__outbox")).json();
  log("emails sent:", outbox.filter((x) => x.channel === "email").map((x) => `${x.to}: ${x.subject}`).join("\n  "));
  log("ERRORS:", errors.length ? errors.join("\n") : "none");
  await b.close();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
