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
    ("home", "index.html", None, "That's Just Good | Do Good Together. See It Add Up.",
     "That's Just Good brings people together to do good: impact events for companies, schools and communities, the My Impact Hub platform, and a podcast and books in Dallas-Fort Worth."),
    ("community", "community.html", "Free Community Events", "Community Pop-Up Volunteer Events | That's Just Good",
     "Free community pop-up events where neighbors come together to help a local cause. Get pop-up alerts or bring one to your neighborhood."),
    ("team-building", "team-building.html", "Team Building", "Team Building Impact Events in DFW | That's Just Good",
     "Private, cause-driven team building events for companies and groups in Dallas-Fort Worth and beyond. Pick any cause and we handle setup, supplies and hosting."),
    ("kids", "kids.html", "School Reading Visits", "Nico Makes A Difference School & Kids Events | That's Just Good",
     "Nico Makes A Difference reading visits for schools, daycares, libraries and youth programs: a story, a conversation and a hands-on kindness activity."),
    ("partners", "partners.html", "For Companies", "Corporate Impact Partners & the Good Council | That's Just Good",
     "Join the Corporate Good Council or hire That's Just Good to design and run your company's giving and volunteering program, from team events to company-wide Days of Service."),
    ("impact-hub", "impact-hub.html", "Impact Hub", "My Impact Hub: Volunteer Hour Tracking for Groups, Students & Companies",
     "Track volunteer hours, donations and goals for NHS chapters, clubs, Greek life, companies and students. Verified transcripts, awards, badges and an annual Impact Unwrapped. Join the waitlist."),
    ("podcast", "podcast.html", "Podcast", "That's Just Good Podcast with Nick Marino Jr.",
     "Nick Marino Jr. talks with founders, nonprofit leaders and everyday changemakers about doing good in their communities. Listen on Spotify, Apple and YouTube."),
    ("books", "books.html", "Books", "Nico Makes A Difference Children's Books by Nick Marino Jr.",
     "Nico Makes A Difference is a children's book series by Nick Marino Jr. that shows kids helping others is something they can do right now. Bulk orders and school visits available."),
    ("about", "about.html", "About", "About That's Just Good and Founder Nick Marino Jr.",
     "Founded in 2020 by Nick Marino Jr., That's Just Good is a Dallas-Fort Worth events, technology and media brand that brings people together to do good."),
    ("plan", "plan.html", None, "Plan Your Team Building Event | That's Just Good",
     "Plan a team building impact event in minutes: choose your cause, group size and date, see your price instantly, and lock in your date online."),
    ("contact", "contact.html", "Contact", "Contact & Book an Event | That's Just Good",
     "Book a team building impact event, a community pop-up or a school reading visit, ask about Impact Partners or the Impact Hub, or pitch a podcast guest."),
]

# Main menu: two dropdown groups plus single links. Labels come from PAGES.
NAV = [
    ("Events", ["community", "team-building", "kids", "partners"]),
    ("impact-hub", None),
    ("Media", ["podcast", "books"]),
    ("about", None),
    ("contact", None),
]
TAGLINE = "Do good together. See it add up."
# One plain line under each menu item, so visitors know where a link goes before they click
NAV_DESC = {
    "community": "Free volunteer events anyone can join",
    "team-building": "A volunteer event just for your team",
    "kids": "Nico story time and a kindness activity",
    "partners": "Year-round giving and volunteer programs",
    "podcast": "Conversations with people doing good",
    "books": "Nico Makes A Difference for kids",
}

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


LABEL = {slug: label for slug, _f, label, *_ in PAGES}


def header(mode, current=None):
    L = links(mode)
    items = []
    for key, children in NAV:
        if children:
            here = current in children
            CUR = ' aria-current="page"'
            subs = "".join(
                f'<a href="{L[s]}"{CUR if s == current else ""}><b>{LABEL[s]}</b><span>{NAV_DESC[s]}</span></a>' for s in children)
            gid = "nav-" + key.lower()
            items.append(
                f'<div class="nav-group{" here" if here else ""}">'
                f'<button class="nav-top" type="button" aria-expanded="false" aria-controls="{gid}">{key}</button>'
                f'<div class="nav-sub" id="{gid}">{subs}</div></div>')
        else:
            cur = ' aria-current="page"' if key == current else ""
            cls = ' class="btn"' if key == "contact" else ""
            items.append(f'<a href="{L[key]}"{cls}{cur}>{LABEL[key]}</a>')
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
      <p>{TAGLINE}</p>
      <p><a href="mailto:dogood@thatsjustgood.com">dogood@thatsjustgood.com</a></p>
    </div>
    <div><div class="footer-head">Events</div><ul>
      <li><a href="{L["community"]}">Free Community Events</a></li><li><a href="{L["team-building"]}">Team Building</a></li>
      <li><a href="{L["kids"]}">School Reading Visits</a></li><li><a href="{L["partners"]}">For Companies</a></li></ul></div>
    <div><div class="footer-head">Platform &amp; Media</div><ul>
      <li><a href="{L["impact-hub"]}">Impact Hub</a></li><li><a href="{L["podcast"]}">Podcast</a></li>
      <li><a href="{L["books"]}">Books</a></li><li><a href="{L["about"]}">About</a></li><li><a href="{L["contact"]}">Contact</a></li></ul></div>
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


def page_url(slug):
    f = dict((s, fn) for s, fn, *_ in PAGES)[slug]
    return DOMAIN + ("/" if slug == "home" else "/" + f.replace(".html", ""))


def faqs(slug):
    """Question and answer pairs read from the page's own .faq section, so the schema always matches the page."""
    import re
    src = read("pages", slug + ".html")
    out = []
    for q, a in re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", src, re.S):
        clean = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
        out.append({"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}})
    return out


def group_of(slug):
    for key, children in NAV:
        if children and slug in children:
            return key
    return None


def structured_data(slug, url, title, desc):
    import json
    org = {
        "@type": "Organization", "@id": DOMAIN + "/#org", "name": "That's Just Good", "url": DOMAIN + "/",
        "logo": DOMAIN + "/images/brand/icon-512.png", "image": DOMAIN + "/images/brand/share-home.jpg",
        "description": PAGES[0][4], "slogan": TAGLINE, "email": "dogood@thatsjustgood.com", "foundingDate": "2020",
        "founder": {"@id": FOUNDER["@id"]},
        "areaServed": {"@type": "Place", "name": "Dallas-Fort Worth, Texas"},
        "knowsAbout": ["Corporate volunteering", "Team building", "Community service", "Volunteer hour tracking",
                       "Corporate philanthropy", "Service learning", "Children's books about kindness"],
        "sameAs": list(SOCIAL.values()),
    }
    page = {"@type": "WebPage", "@id": url + "#page", "url": url, "name": title, "description": desc,
            "isPartOf": {"@id": DOMAIN + "/#site"}, "about": {"@id": DOMAIN + "/#org"},
            "primaryImageOfPage": DOMAIN + f"/images/brand/share-{slug}.jpg", "inLanguage": "en-US"}
    graph = [org, page]
    if slug != "home":
        page["breadcrumb"] = {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": DOMAIN + "/"},
            {"@type": "ListItem", "position": 2, "name": LABEL.get(slug) or title.split(" | ")[0], "item": url}]}
    qa = faqs(slug)
    if qa:
        graph.append({"@type": "FAQPage", "@id": url + "#faq", "mainEntity": qa})
    usd = lambda name, price, **kw: dict({"@type": "Offer", "name": name, "price": price, "priceCurrency": "USD"}, **kw)
    if slug == "impact-hub":
        graph.append({"@type": "SoftwareApplication", "name": "My Impact Hub", "alternateName": "My Impact Hub by That's Just Good",
                      "applicationCategory": "BusinessApplication", "operatingSystem": "Web, iOS, Android", "url": url,
                      "description": desc, "publisher": {"@id": DOMAIN + "/#org"},
                      "featureList": ["Volunteer hour tracking", "Supervisor verification", "Verified service transcripts",
                                      "Awards and scholarship tracking", "Badges", "Impact Unwrapped annual recap",
                                      "Group goals and approvals", "Events and QR check-in", "Corporate gift matching"],
                      "offers": [usd("Personal", "0"), usd("Verified Student", "39", description="Per year"),
                                 usd("Starter Group", "0"), usd("Group", "19", description="Per month"),
                                 usd("Group Plus", "49", description="Per month"), usd("Network", "99", description="Per month"),
                                 usd("Company Team", "99", description="Per month, up to 50 employees"),
                                 usd("Company Business", "299", description="Per month, up to 250 employees"),
                                 usd("Company Business Plus", "599", description="Per month, up to 1,000 employees")]})
    if slug == "partners":
        graph.append({"@type": "Service", "name": "Impact Partners", "serviceType": "Corporate philanthropy and employee volunteering programs",
                      "provider": {"@id": DOMAIN + "/#org"}, "areaServed": "United States", "url": url, "description": desc,
                      "offers": [usd("The Good Council", "25000", description="Per year"),
                                 usd("Impact Build", "18000", description="One time, 6 to 8 weeks"),
                                 usd("Impact Partner Core", "60000", description="Per year, up to 500 employees"),
                                 usd("Impact Partner Growth", "120000", description="Per year, up to 2,000 employees")]})
    if slug == "books":
        graph.append({"@type": "BookSeries", "name": "Nico Makes A Difference", "url": url, "description": desc,
                      "author": {"@id": FOUNDER["@id"]}, "publisher": {"@id": DOMAIN + "/#org"},
                      "audience": {"@type": "PeopleAudience", "audienceType": "Children"}, "inLanguage": "en-US"})
        graph.append(dict(FOUNDER))
    if slug == "kids":
        graph.append({"@type": "Service", "name": "Nico Makes A Difference school reading visits", "serviceType": "School and youth program visits",
                      "provider": {"@id": DOMAIN + "/#org"}, "areaServed": "Dallas-Fort Worth, Texas", "url": url, "description": desc})
    if slug == "community":
        graph.append({"@type": "Service", "name": "Community pop-up volunteer events", "serviceType": "Community volunteering",
                      "provider": {"@id": DOMAIN + "/#org"}, "areaServed": "Dallas-Fort Worth, Texas", "url": url, "description": desc,
                      "offers": usd("Community pop-up", "0")})
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


def llms_txt():
    """A plain-language summary for AI assistants and answer engines (llmstxt.org format)."""
    lines = [
        "# That's Just Good", "",
        f"> {TAGLINE} That's Just Good is a Dallas-Fort Worth brand founded in 2020 by Nick Marino Jr. that brings people "
        "together to do good through three pillars: Events, Technology and Media.", "",
        "- Events: free community pop-up volunteer events, private team building impact events for companies, "
        "Nico Makes A Difference reading visits for schools and kids, and Impact Partners programs for companies.",
        "- Technology: My Impact Hub, a platform for tracking volunteer hours, donations, goals, awards and badges for "
        "students, groups and companies, with verified transcripts and an annual Impact Unwrapped recap. Free for individuals.",
        "- Media: the That's Just Good Podcast hosted by Nick Marino Jr., and the Nico Makes A Difference children's book series.",
        "",
        "Key facts:",
        "- Team building Host Only pricing: $1,250 for 90 minutes, $1,500 for 120 minutes, $2,000 for up to 180 minutes.",
        "- My Impact Hub pricing: Personal free; Verified Student $39 a year; Starter Group free; Group $19 a month; "
        "Group Plus $49 a month; Network $99 a month; Company plans from $99 a month. Currently taking a waitlist.",
        "- Impact Partners: The Good Council $25,000 a year; Impact Build $18,000; Impact Partner Core $60,000 a year; "
        "Impact Partner Growth $120,000 a year; Enterprise from $200,000 a year.",
        "- Contact: dogood@thatsjustgood.com. Based in Dallas-Fort Worth, Texas. Events anywhere.",
        "", "## Pages", "",
    ]
    for slug, _f, label, title, desc in PAGES:
        lines.append(f"- [{label or title.split(' | ')[0]}]({page_url(slug)}): {desc}")
    lines += ["", "## Optional", "",
              f"- [Sitemap]({DOMAIN}/sitemap.xml)",
              f"- [Podcast on Spotify]({SOCIAL['spotify']})", f"- [Podcast on Apple]({SOCIAL['apple']})",
              f"- [YouTube]({SOCIAL['youtube']})", f"- [Instagram]({SOCIAL['instagram']})", ""]
    return "\n".join(lines)


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
        ai = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot",
              "Google-Extended", "Applebot-Extended", "Bingbot"]
        rules = "".join(f"User-agent: {a}\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\n" for a in ai)
        f.write(f"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\n{rules}Sitemap: {DOMAIN}/sitemap.xml\n")
    with open(os.path.join(SITE, "llms.txt"), "w") as f:
        f.write(llms_txt())
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
<meta property="og:image" content="{DOMAIN}/images/brand/share-{slug}.jpg"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{html.escape(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(title)}"><meta name="twitter:description" content="{html.escape(desc)}"><meta name="twitter:image" content="{DOMAIN}/images/brand/share-{slug}.jpg"><meta name="twitter:image:alt" content="{html.escape(title)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/images/brand/icon.svg" type="image/svg+xml">
<link rel="icon" href="/images/brand/icon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/images/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
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
