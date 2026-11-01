// Live podcast feed for thatsjustgood.com
// Pulls the show's RSS feed (the same feed Spotify and Apple Podcasts read) and the YouTube channel feed,
// and returns them as JSON at /api/episodes. Netlify caches the response for an hour, so new episodes
// show up on the site within an hour of publishing, with nothing to update by hand.

const PODCAST_RSS = "https://feeds.simplecast.com/H_gjpOBW";
const YOUTUBE_RSS = "https://www.youtube.com/feeds/videos.xml?channel_id=UCpWWwSa9jsb53tngJoJ1HcA";

const unCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, " ");
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(unCdata(m[1])) : "";
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`));
  return m ? decode(m[1]) : "";
};
const text = (s) => s.replace(/<[^>]+>/g, " ").replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
const minutes = (d) => {
  if (!d) return 0;
  const parts = d.split(":").map(Number);
  const secs = parts.length === 1 ? parts[0] : parts.reduce((t, n) => t * 60 + n, 0);
  return Math.round(secs / 60);
};
const clip = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "thatsjustgood.com" } });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  }
}

export default async () => {
  const [rss, yt] = await Promise.all([get(PODCAST_RSS), get(YOUTUBE_RSS)]);

  const episodes = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => ({
    title: tag(it, "title"),
    date: new Date(tag(it, "pubDate")).toISOString(),
    minutes: minutes(tag(it, "itunes:duration")),
    desc: clip(text(tag(it, "description") || tag(it, "itunes:summary")), 240),
    audio: attr(it, "enclosure", "url"),
    link: tag(it, "link"),
  }));

  const videos = [...yt.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: tag(e, "yt:videoId"),
    title: tag(e, "title"),
    date: tag(e, "published"),
  }));

  if (!episodes.length) {
    return new Response(JSON.stringify({ error: "feed unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ updated: new Date().toISOString(), total: episodes.length, episodes, videos }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
};

export const config = { path: "/api/episodes" };
