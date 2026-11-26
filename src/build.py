"""Builds the deployable multi-page site (../site) and the single-file preview (../preview/index.html)
from the same page fragments, styles and script. Run: python3 build.py"""
import os, shutil, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
PREVIEW = os.path.join(ROOT, "preview")
DOMAIN = "https://thatsjustgood.com"  # primary domain on Netlify; www redirects here

PAGES = [
    # slug, file, nav label, <title>, meta description
    ("home", "index.html", None, "That's Just Good | Impact Events, Pop-Ups & Podcast",
     "Team building impact events, community pop-ups, kids reading visits and a podcast. That's Just Good brings people together to do good in Dallas-Fort Worth."),
    ("team-building", "team-building.html", "Team Building", "Team Building Impact Events in DFW | That's Just Good",
     "Private, cause-driven team building events for companies and groups in Dallas-Fort Worth and beyond. Pick any cause and we handle setup, supplies and hosting."),
    ("community", "community.html", "Community", "Community Pop-Up Volunteer Events | That's Just Good",
     "Free community pop-up events where neighbors come together to help a local cause. Get pop-up alerts or bring one to your neighborhood."),
    ("kids", "kids.html", "Kids", "Nico Makes A Difference Kids Events | That's Just Good",
     "Nico Makes A Difference reading visits for schools, daycares, libraries and youth programs: a story, a conversation and a hands-on kindness activity."),
    ("podcast", "podcast.html", "Podcast", "That's Just Good Podcast with Nick Marino Jr.",
     "Nick Marino Jr. talks with founders, nonprofit leaders and everyday changemakers about doing good in their communities. Listen on Spotify, Apple and YouTube."),
    ("about", "about.html", "About", "About That's Just Good and Founder Nick Marino Jr.",
     "Founded in 2020 by Nick Marino Jr., That's Just Good is a Dallas-Fort Worth media and events brand that brings people together to do good."),
    ("plan", "plan.html", None, "Plan Your Team Building Event | That's Just Good",
     "Plan a team building impact event in minutes: choose your cause, group size and date, see your price instantly, and lock in your date online."),
    ("contact", "contact.html", "Contact", "Contact & Book an Event | That's Just Good",
     "Book a team building impact event, a community pop-up or a kids reading visit, or pitch a podcast guest. Email dogood@thatsjustgood.com."),
]

# Pages rendered by /assets/app.js from the events API. Not indexed by search engines.
APP_PAGES = [
    ("event", "event.html", "Event | That's Just Good"),
    ("rsvp", "rsvp.html", "Your RSVP | That's Just Good"),
    ("booking", "booking.html", "Your Booking | That's Just Good"),
    ("team", "team.html", "Team Event | That's Just Good"),
    ("report", "report.html", "Impact Report | That's Just Good"),
    ("certificate", "certificate.html", "Volunteer Certificate | That's Just Good"),
    ("checkin", "checkin.html", "Check-in | That's Just Good"),
]

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Unbounded:wght@500;600;700;800;900&display=swap">'


def read(*p):
    with open(os.path.join(HERE, *p), encoding="utf-8") as f:
        return f.read()


def links(mode):
    if mode == "site":
        return {slug: ("/" if slug == "home" else "/" + f.replace(".html", "")) for slug, f, *_ in PAGES}
    out = {slug: "#" + slug for slug, *_ in PAGES}
    out["plan"] = "#team-building"  # the planner needs the live API, so the preview points to Team Building
    return out


def fill(text, mode):
    for slug, href in links(mode).items():
        text = text.replace("{{%s}}" % slug, href)
    return text


def header(mode, current=None):
    L = links(mode)
    items = []
    for slug, _f, label, *_ in PAGES:
        if not label:
            continue
        cur = ' aria-current="page"' if slug == current else ""
        cls = ' class="btn"' if slug == "contact" else ""
        items.append(f'<a href="{L[slug]}"{cls}{cur}>{label}</a>')
    return f'''<header class="site-header"><div class="wrap header-row" style="position:relative">
  <a class="wordmark" href="{L["home"]}" aria-label="That's Just Good home"><img class="logo-light" src="/images/brand/logo-horizontal.svg" alt="" width="248" height="44"><img class="logo-dark" src="/images/brand/logo-horizontal-reversed.svg" alt="" width="248" height="44"></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
  <nav class="nav" id="site-nav" aria-label="Main">{"".join(items)}</nav>
</div></header>'''


def footer(mode):
    L = links(mode)
    return f'''<footer class="site-footer"><div class="wrap">
  <div class="footer-grid">
    <div class="stack">
      <a class="wordmark footer-logo" href="{L["home"]}" aria-label="That's Just Good home"><img src="/images/brand/logo-stacked-reversed.svg" alt="" width="181" height="120"></a>
      <p>Show up. Do good. Tell the story.</p>
      <p><a href="mailto:dogood@thatsjustgood.com">dogood@thatsjustgood.com</a></p>
    </div>
    <div><div class="footer-head">Explore</div><ul>
      <li><a href="{L["team-building"]}">Team Building</a></li><li><a href="{L["community"]}">Community Events</a></li>
      <li><a href="{L["kids"]}">Kids Events</a></li><li><a href="{L["podcast"]}">Podcast</a></li>
      <li><a href="{L["about"]}">About</a></li><li><a href="{L["contact"]}">Contact</a></li></ul></div>
    <div><div class="footer-head">Follow</div><ul>
      <li><a href="https://www.instagram.com/thatsjustgood" target="_blank" rel="noopener">Instagram</a></li>
      <li><a href="https://www.tiktok.com/@thatsjustnick" target="_blank" rel="noopener">TikTok</a></li>
      <li><a href="https://www.linkedin.com/in/nickmarinojr/" target="_blank" rel="noopener">LinkedIn</a></li>
      <li><a href="https://open.spotify.com/show/6es7fmFIA78NqTLom4aF7y" target="_blank" rel="noopener">Spotify</a></li>
      <li><a href="https://podcasts.apple.com/us/podcast/thats-just-good/id1610464170" target="_blank" rel="noopener">Apple Podcasts</a></li>
      <li><a href="https://www.youtube.com/channel/UCpWWwSa9jsb53tngJoJ1HcA" target="_blank" rel="noopener">YouTube</a></li></ul></div>
  </div>
  <div class="footer-base"><span>© <span data-year>2026</span> That's Just Good</span><span>Dallas–Fort Worth, Texas</span></div>
</div></footer>'''


SOCIAL = {
    "instagram": "https://www.instagram.com/thatsjustgood",
    "youtube": "https://www.youtube.com/channel/UCpWWwSa9jsb53tngJoJ1HcA",
    "spotify": "https://open.spotify.com/show/6es7fmFIA78NqTLom4aF7y",
    "apple": "https://podcasts.apple.com/us/podcast/thats-just-good/id1610464170",
}
FOUNDER = {
    "@type": "Person", "@id": DOMAIN + "/about#nick", "name": "Nick Marino Jr.",
    "jobTitle": "Founder & Chief Giving Officer", "url": DOMAIN + "/about",
    "sameAs": ["https://www.linkedin.com/in/nickmarinojr/", "https://www.instagram.com/thatsjustnick",
               "https://www.tiktok.com/@thatsjustnick", "https://www.nickmarinojr.com"],
}


def structured_data(slug, url, title, desc):
    import json
    org = {
        "@type": "Organization", "@id": DOMAIN + "/#org", "name": "That's Just Good", "url": DOMAIN + "/",
        "logo": DOMAIN + "/images/brand/icon-512.png", "image": DOMAIN + "/images/brand/share-home.jpg",
        "description": PAGES[0][4], "email": "dogood@thatsjustgood.com", "foundingDate": "2020",
        "founder": {"@id": FOUNDER["@id"]},
        "areaServed": {"@type": "Place", "name": "Dallas-Fort Worth, Texas"},
        "sameAs": list(SOCIAL.values()),
    }
    page = {"@type": "WebPage", "@id": url + "#page", "url": url, "name": title, "description": desc,
            "isPartOf": {"@id": DOMAIN + "/#site"}, "about": {"@id": DOMAIN + "/#org"},
            "primaryImageOfPage": DOMAIN + f"/images/brand/share-{slug}.jpg"}
    graph = [org, page]
    if slug == "home":
        graph.append({"@type": "WebSite", "@id": DOMAIN + "/#site", "url": DOMAIN + "/", "name": "That's Just Good",
                      "publisher": {"@id": DOMAIN + "/#org"}})
    if slug == "team-building":
        graph.append({"@type": "Service", "name": "Team Building Impact Events", "serviceType": "Cause-driven team building",
                      "provider": {"@id": DOMAIN + "/#org"}, "areaServed": "Dallas-Fort Worth, Texas", "url": url,
                      "offers": [
                          {"@type": "Offer", "name": "Host Only, 90 minutes", "price": "1250", "priceCurrency": "USD"},
                          {"@type": "Offer", "name": "Host Only, 120 minutes", "price": "1500", "priceCurrency": "USD"},
                          {"@type": "Offer", "name": "Host Only, up to 180 minutes", "price": "2000", "priceCurrency": "USD"},
                          {"@type": "Offer", "name": "All-Inclusive (priced by attendees and length)"}]})
    if slug == "podcast":
        graph.append({"@type": "PodcastSeries", "name": "That's Just Good", "url": url, "webFeed": "https://feeds.simplecast.com/H_gjpOBW",
                      "description": desc, "image": DOMAIN + "/images/brand/share-podcast.jpg",
                      "author": {"@id": FOUNDER["@id"]}, "publisher": {"@id": DOMAIN + "/#org"},
                      "sameAs": [SOCIAL["spotify"], SOCIAL["apple"], SOCIAL["youtube"]]})
    if slug == "about":
        page["@type"] = "AboutPage"
        graph.append(dict(FOUNDER, worksFor={"@id": DOMAIN + "/#org"}))
    if slug == "contact":
        page["@type"] = "ContactPage"
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace("</", "<\\/")


def build_extras():
    """robots.txt, sitemap.xml, web manifest, favicon.ico at the root, and a branded 404 page."""
    import datetime, json
    today = datetime.date.today().isoformat()
    urls = [DOMAIN + ("/" if slug == "home" else "/" + f.replace(".html", "")) for slug, f, *_ in PAGES]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
    sm.append("</urlset>")
    with open(os.path.join(SITE, "sitemap.xml"), "w") as f:
        f.write("\n".join(sm) + "\n")
    with open(os.path.join(SITE, "robots.txt"), "w") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {DOMAIN}/sitemap.xml\n")
    manifest = {"name": "That's Just Good", "short_name": "That's Just Good", "start_url": "/", "display": "standalone",
                "background_color": "#F4F8FB", "theme_color": "#13294B",
                "icons": [{"src": "/images/brand/icon-192.png", "sizes": "192x192", "type": "image/png"},
                          {"src": "/images/brand/icon-512.png", "sizes": "512x512", "type": "image/png"},
                          {"src": "/images/brand/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    with open(os.path.join(SITE, "site.webmanifest"), "w") as f:
        json.dump(manifest, f, indent=2)
    shutil.copy(os.path.join(HERE, "brand", "favicon.ico"), os.path.join(SITE, "favicon.ico"))
    body = f'''<section class="page-hero coral"><div class="wrap stack">
    <span class="eyebrow">Page not found</span>
    <h1>This page took a day off</h1>
    <p class="lede">The page you're looking for moved or never existed. Here's where to find the good stuff.</p>
    <div class="btn-row"><a class="btn dark" href="/">Go home</a><a class="btn ghost" href="/team-building">Team building</a><a class="btn ghost" href="/podcast">Podcast</a></div>
  </div></section>'''
    doc = f'''<!doctype html>
<html lang="en" data-live>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Page not found | That's Just Good</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#13294B">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/images/brand/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/brand/apple-touch-icon.png">
{FONTS}
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
{header("site")}
<main id="main">
{body}
</main>
{footer("site")}
<script src="/assets/site.js" defer></script>
<script type="module" src="/assets/app.js"></script>
</body>
</html>
'''
    with open(os.path.join(SITE, "404.html"), "w") as f:
        f.write(doc)


def build_site():
    # Rebuilds pages and assets; never touches photos you've added to site/images
    os.makedirs(os.path.join(SITE, "assets"), exist_ok=True)
    os.makedirs(os.path.join(SITE, "images"), exist_ok=True)
    shutil.copy(os.path.join(HERE, "style.css"), os.path.join(SITE, "assets", "style.css"))
    shutil.copy(os.path.join(HERE, "site.js"), os.path.join(SITE, "assets", "site.js"))
    shutil.copy(os.path.join(HERE, "app.js"), os.path.join(SITE, "assets", "app.js"))
    shutil.copy(os.path.join(HERE, "admin.js"), os.path.join(SITE, "assets", "admin.js"))
    shutil.copy(os.path.join(HERE, "admin.html"), os.path.join(SITE, "admin.html"))
    shutil.copy(os.path.join(ROOT, "netlify", "lib", "pricing.mjs"), os.path.join(SITE, "assets", "pricing.js"))
    for slug, fname, _label, title, desc in PAGES:
        body = fill(read("pages", slug + ".html"), "site")
        url = DOMAIN + ("/" if slug == "home" else "/" + fname.replace(".html", ""))
        doc = f'''<!doctype html>
<html lang="en" data-live>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#13294B">
<meta property="og:type" content="website"><meta property="og:site_name" content="That's Just Good"><meta property="og:locale" content="en_US">
<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{DOMAIN}/images/brand/share-{slug}.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{html.escape(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(title)}"><meta name="twitter:description" content="{html.escape(desc)}"><meta name="twitter:image" content="{DOMAIN}/images/brand/share-{slug}.jpg"><meta name="twitter:image:alt" content="{html.escape(title)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/images/brand/icon.svg" type="image/svg+xml">
<link rel="icon" href="/images/brand/icon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/images/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">{structured_data(slug, url, title, desc)}</script>
{FONTS}
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<a class="hp" href="#main">Skip to content</a>
{header("site", slug)}
<main id="main">
{body}
</main>
{footer("site")}
<script src="/assets/site.js" defer></script>
<script type="module" src="/assets/app.js"></script>
</body>
</html>
'''
        with open(os.path.join(SITE, fname), "w", encoding="utf-8") as f:
            f.write(doc)
    for slug, fname, title in APP_PAGES:
        body = fill(read("pages", f"app-{slug}.html"), "site")
        doc = f'''<!doctype html>
<html lang="en" data-live>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#13294B">
<meta property="og:site_name" content="That's Just Good"><meta property="og:title" content="{html.escape(title)}">
<meta property="og:image" content="{DOMAIN}/images/brand/share-home.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/images/brand/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/brand/apple-touch-icon.png">
{FONTS}
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
{header("site")}
<main id="main">
{body}
</main>
{footer("site")}
<script src="/assets/site.js" defer></script>
<script type="module" src="/assets/app.js"></script>
</body>
</html>
'''
        with open(os.path.join(SITE, fname), "w", encoding="utf-8") as f:
            f.write(doc)
    # brand logo files (from the logo kit) used by the header, footer, tab icon and share image
    brand_out = os.path.join(SITE, "images", "brand")
    os.makedirs(brand_out, exist_ok=True)
    for f in os.listdir(os.path.join(HERE, "brand")):
        if f != "icon-2000.png":
            shutil.copy(os.path.join(HERE, "brand", f), os.path.join(brand_out, f))
    old_fav = os.path.join(SITE, "images", "favicon.svg")
    if os.path.exists(old_fav):
        os.remove(old_fav)
    shutil.copy(os.path.join(HERE, "deploy", "images-README.txt"), os.path.join(SITE, "images", "README.txt"))
    old_share = os.path.join(brand_out, "share.jpg")
    if os.path.exists(old_share):
        os.remove(old_share)
    build_extras()


def build_preview():
    os.makedirs(PREVIEW, exist_ok=True)
    sections = "\n".join(
        f'<div data-page="{slug}">\n{fill(read("pages", slug + ".html"), "preview")}\n</div>' for slug, *_ in PAGES if slug != "plan")
    doc = f'''<title>That's Just Good</title>
<meta name="claude:viewport-fit-sides" content="cover">
{FONTS}
<style>
{read("style.css")}
</style>
{header("preview", "home")}
<main id="main" data-spa>
{sections}
</main>
{footer("preview")}
<script>
{read("site.js")}
</script>
'''
    # the preview has no image folder, so brand SVGs are embedded inline
    import base64, re
    def inline(m):
        data = open(os.path.join(HERE, "brand", m.group(1)), "rb").read()
        return 'src="data:image/svg+xml;base64,' + base64.b64encode(data).decode() + '"'
    doc = re.sub(r'src="/images/brand/([\w.-]+\.svg)"', inline, doc)
    with open(os.path.join(PREVIEW, "index.html"), "w", encoding="utf-8") as f:
        f.write(doc)


if __name__ == "__main__":
    build_site()
    build_preview()
    print("built", SITE, PREVIEW)
