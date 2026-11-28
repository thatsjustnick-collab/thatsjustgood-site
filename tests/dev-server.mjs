// Local development server: serves the built site and runs the API with in-memory stand-ins.
// Usage: node tests/dev-server.mjs [port] [--seed]
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.argv[2]) || 8888;
process.env.URL = `http://localhost:${PORT}`;
const SITE = new URL("../site/", import.meta.url).pathname;
const { default: api } = await import("../netlify/functions/api.mjs");
const { getOutbox } = await import("../netlify/lib/notify.mjs");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
const REWRITES = [[/^\/events\/[^/]+$/, "/event.html"], [/^\/rsvp\/[^/]+$/, "/rsvp.html"], [/^\/team\/[^/]+$/, "/team.html"], [/^\/report\/[^/]+$/, "/report.html"], [/^\/certificate\/[^/]+$/, "/certificate.html"], [/^\/checkin\/[^/]+$/, "/checkin.html"], [/^\/hub(\/.*)?$/, "/hub/index.html"]];

async function serveFile(path, res) {
  let p = path;
  for (const [re, to] of REWRITES) if (re.test(p)) p = to;
  if (p.endsWith("/")) p += "index.html";
  let file = normalize(join(SITE, p));
  if (!file.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); }
  catch { if (!extname(file)) file += ".html"; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/html" });
    res.end(await readFile(join(SITE, "404.html")));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/__outbox") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(getOutbox())); }
  if (url.pathname.startsWith("/dev-photos/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#8ED1FC"/><text x="200" y="160" text-anchor="middle" font-family="Arial" font-size="22" fill="#13294B">Uploaded photo</text></svg>`);
  }
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/episodes") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await api(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    const headers = Object.fromEntries(r.headers.entries());
    res.writeHead(r.status, headers);
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (url.pathname === "/api/episodes") { res.writeHead(404); return res.end(); }
  return serveFile(url.pathname, res);
});

server.listen(PORT, async () => {
  console.log(`dev server on http://localhost:${PORT}`);
  if (process.argv.includes("--seed")) {
    const call = (method, path, body) => api(new Request(`http://localhost:${PORT}${path}`, { method, headers: { "content-type": "application/json", authorization: "Bearer dev-admin" }, body: body ? JSON.stringify(body) : undefined })).then((r) => r.json());
    const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    await call("POST", "/api/admin/events", { title: "Winter Blanket Drive Pop-Up", kind: "community", cause: "Homelessness", capacity: 40, status: "published", date: d(9), start_time: "10:00", end_time: "12:00",
      venue_name: "Klyde Warren Park Pavilion", address: "2012 Woodall Rodgers Fwy, Dallas, TX 75201", parking: "Free street parking on Saturdays, plus the Klyde Warren garage.", what_to_bring: "Closed-toe shoes and a water bottle",
      summary: "Tie fleece blankets and pack care kits for neighbors experiencing homelessness this winter.", description: "Bring a friend and help us make 300 blankets in one morning.\n\nAll supplies provided. Kids are welcome with an adult.", allow_chip_in: true });
    await call("POST", "/api/admin/events", { title: "Nico Makes A Difference Story Time", kind: "kids", cause: "Kindness", capacity: 30, status: "published", date: d(16), start_time: "10:30", end_time: "11:30",
      venue_name: "Plano Public Library, Haggard Branch", address: "2501 Coit Rd, Plano, TX 75075", summary: "A read-aloud from the Nico Makes A Difference series, then a kindness card activity." });
    await call("POST", "/api/admin/events", { title: "First Responder Thank-You Cards", kind: "community", cause: "First responders", capacity: 25, status: "published", date: d(23), start_time: "18:00", end_time: "19:30",
      venue_name: "Legacy Hall", address: "7800 Windrose Ave, Plano, TX 75024", summary: "Write cards and pack snack bags for Plano firefighters and police." });
    console.log("seeded");
  }
});
