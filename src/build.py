"""Builds the deployable multi-page site (../site) and the single-file preview (../preview/index.html)
from the same page fragments, styles and script. Run: python3 build.py"""
import os, shutil, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
PREVIEW = os.path.join(ROOT, "preview")
DOMAIN = "https://www.thatsjustgood.com"

PAGES = [
    # slug, file, nav label, <title>, meta description
    ("home", "index.html", None, "That's Just Good | Impact Events, Community Pop-Ups & Podcast",
     "That's Just Good brings people together to do good: private team building impact events, community pop-ups, kids reading events, and a podcast about changemakers."),
    ("team-building", "team-building.html", "Team Building", "Team Building Impact Events | That's Just Good",
     "Private, cause-driven team building events for companies and groups. Pick any cause, and we handle setup, supplies, and hosting."),
    ("community", "community.html", "Community", "Community Pop-Up Events | That's Just Good",
     "Free pop-up events where neighbors come together to help a local cause."),
    ("kids", "kids.html", "Kids", "Kids Events & Nico Makes A Difference | That's Just Good",
     "Reading visits from the Nico Makes A Difference series for schools, daycares, libraries and youth organizations."),
    ("podcast", "podcast.html", "Podcast", "That's Just Good Podcast | Hosted by Nick Marino Jr.",
     "Conversations with founders, nonprofit leaders and everyday changemakers doing good in their communities."),
    ("about", "about.html", "About", "About | That's Just Good",
     "Founded in 2020 by Nick Marino Jr., That's Just Good is a media and events brand built on doing good together."),
    ("contact", "contact.html", "Contact", "Contact | That's Just Good",
     "Book a team building event, a community pop-up, a kids reading visit, or pitch a podcast guest."),
]

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Unbounded:wght@500;600;700;800;900&display=swap">'


def read(*p):
    with open(os.path.join(HERE, *p), encoding="utf-8") as f:
        return f.read()


def links(mode):
    if mode == "site":
        return {slug: ("/" if slug == "home" else "/" + f.replace(".html", "")) for slug, f, *_ in PAGES}
    return {slug: "#" + slug for slug, *_ in PAGES}


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
  <a class="wordmark" href="{L["home"]}" aria-label="That's Just Good home"><span class="w1">That's Just</span><span class="w2">Go<span>o</span>d</span></a>
  <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
  <nav class="nav" id="site-nav" aria-label="Main">{"".join(items)}</nav>
</div></header>'''


def footer(mode):
    L = links(mode)
    return f'''<footer class="site-footer"><div class="wrap">
  <div class="footer-grid">
    <div class="stack">
      <a class="wordmark" href="{L["home"]}"><span class="w1">That's Just</span><span class="w2">Go<span>o</span>d</span></a>
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


def build_site():
    # Rebuilds pages and assets; never touches photos you've added to site/images
    os.makedirs(os.path.join(SITE, "assets"), exist_ok=True)
    os.makedirs(os.path.join(SITE, "images"), exist_ok=True)
    shutil.copy(os.path.join(HERE, "style.css"), os.path.join(SITE, "assets", "style.css"))
    shutil.copy(os.path.join(HERE, "site.js"), os.path.join(SITE, "assets", "site.js"))
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
<meta property="og:type" content="website"><meta property="og:site_name" content="That's Just Good">
<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{DOMAIN}/images/share.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
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
</body>
</html>
'''
        with open(os.path.join(SITE, fname), "w", encoding="utf-8") as f:
            f.write(doc)
    # favicon
    with open(os.path.join(SITE, "images", "favicon.svg"), "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#13294B"/><text x="32" y="44" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="34" fill="#8ED1FC">G</text></svg>')
    shutil.copy(os.path.join(HERE, "deploy", "images-README.txt"), os.path.join(SITE, "images", "README.txt"))


def build_preview():
    os.makedirs(PREVIEW, exist_ok=True)
    sections = "\n".join(
        f'<div data-page="{slug}">\n{fill(read("pages", slug + ".html"), "preview")}\n</div>' for slug, *_ in PAGES)
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
    with open(os.path.join(PREVIEW, "index.html"), "w", encoding="utf-8") as f:
        f.write(doc)


if __name__ == "__main__":
    build_site()
    build_preview()
    print("built", SITE, PREVIEW)
