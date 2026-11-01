# thatsjustgood.com

The That's Just Good website. Hosted on Netlify: any change saved to this repository goes live in about a minute.

## What's where

| Folder / file | What it is |
|---|---|
| `site/` | **The live website.** Netlify publishes exactly this folder. |
| `site/index.html`, `team-building.html`, `community.html`, `kids.html`, `podcast.html`, `about.html`, `contact.html` | The seven pages |
| `site/assets/style.css` | Colors, fonts and layout (brand colors are at the top) |
| `site/assets/site.js` | Menu, forms, podcast episode list |
| `site/images/` | Photos (see `site/images/README.txt` for file names) |
| `netlify/functions/episodes.mjs` | Pulls new podcast episodes from the show's feed automatically |
| `netlify.toml` | Netlify settings and redirects from the old Wix page addresses |
| `src/` | The source the pages are built from (used when Claude makes changes) |
| `brand/logo-concepts/` | Logo directions A (Sunrise), B (Smile), C (Stamp) as SVG files |

## Making changes

**Easiest:** ask Claude in a chat ("change the 90-minute price to $1,400", "add a pop-up on Nov 15"). Claude edits
`src/`, rebuilds `site/`, and saves both here. Netlify publishes it automatically.

**Small text fixes yourself:** open the page in `site/` on github.com, click the pencil icon, edit the text,
and click **Commit changes**. It goes live in about a minute. (If you edit `site/` directly, mention it to Claude
next time so the change is copied into `src/` too.)

**Adding photos:** open `site/images/` on github.com → **Add file → Upload files**, using the names in
`site/images/README.txt`.

## Netlify setup (one time)

1. netlify.com → sign up with GitHub.
2. **Add new site → Import an existing project → GitHub** → pick `thatsjustgood-site`.
3. Leave the build command empty. Publish directory and functions are read from `netlify.toml`. Click **Deploy**.
4. **Site configuration → Forms → Form notifications → Email** → dogood@thatsjustgood.com.
5. **Domain management → Add a domain** → `thatsjustgood.com`, then update DNS where the domain is registered.

## Podcast

New episodes appear automatically within about an hour of publishing on Spotify and Apple Podcasts.
Nothing to update by hand.
