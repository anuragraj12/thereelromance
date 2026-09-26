# The Reel Romance — website

Live at **https://threelromance.com** (GitHub Pages, custom domain in `CNAME`).

The whole site is generated from one file: **`content/site.json`**.
You never edit `index.html` or the story pages by hand; they are rebuilt from the content file.

```
content/site.json        ← all words, photos, films, reels, contact details
assets/css/site.css      ← design system + layouts (mobile, tablet, desktop)
assets/js/site.js        ← interactions (hero, reel, films, reels, form)
assets/media/            ← web-ready versions of local photos (+ manifest.json)
assets/fonts/, icons/    ← self-hosted fonts (OFL) and favicons
src/render.mjs, lib.mjs  ← page templates and image helpers
build.mjs                ← builds index.html, stories/*/, 404.html, sitemap.xml
tools/check.mjs          ← quality gate (alt text, broken links, stock photos…)
tools/prepare_images.py  ← turns full-res originals into responsive web images
```

---

## Editing the site

The easy way is on GitHub itself: open `content/site.json` → ✏️ **Edit** → change text → **Commit to main**.
The *Build & check site* action rebuilds the pages and commits them; the live site updates a minute later.
If the check fails (for example a photo has no description), the action turns red and tells you exactly which line to fix.

Text: anything wrapped in `*asterisks*` is set in *italic serif*, e.g. `"Tell us about *your day.*"`.

### Changing a photo (and why it can't look stretched any more)

Every photo is written like this:

```json
{ "src": "ik:DSC01889.JPG", "alt": "A candle-lit mandap at night", "focus": "50% 40%", "focusMobile": "60% 45%" }
```

| field | meaning |
|---|---|
| `src` | `ik:<file>` = a file in your ImageKit library (recommended). `local:<name>` = a photo prepared into `assets/media`. A full `https://` link also works. |
| `alt` | One plain sentence describing the photo. Required — it is what Google and screen readers see. |
| `focus` | Which point must stay visible when the photo is cropped to fit a frame: `"horizontal% vertical%"`. `"50% 50%"` = centre, `"50% 20%"` = keep the top, `"30% 50%"` = keep the left. |
| `focusMobile` | Same, for phones (tall screens crop landscape photos a lot). Optional. |
| `ratio` | Optional hint like `"3/2"` or `"4/5"` for ImageKit photos, so the space is reserved before the photo loads. The real shape is detected automatically either way. |

There are two kinds of photo slots, and neither can distort a photo:

* **Framed slots** — the hero, story covers, film posters, the "idea" pair. The design fixes the frame's shape; your photo *fills* it (cropped, never squashed). Use `focus` to choose what stays in view.
* **Natural slots** — the "Selected frames" reel and story galleries. The photo keeps its own shape (portrait, landscape, square or panorama) and the layout adapts around it.

**ImageKit (recommended):** upload the photo to your ImageKit library, then use `"src": "ik:<exact file name>"`.
The site automatically requests the right size for each screen (480px → 2400px, WebP/AVIF), so phones never download huge files.

**Local photos:** put originals in `media-src/` (this folder is never published), run
`python3 tools/prepare_images.py media-src/`, then use `"src": "local:<file-name-in-lowercase>"`.

### Adding a wedding story

Copy the `anurag-garima` block inside `stories.items`, change `slug` (becomes `/stories/<slug>/`), `couple`, `date` (`YYYY-MM-DD`), `place`, `summary`, `intro`, `cover`, `gallery`, `film` (YouTube id) and `bts` (ids from the BTS list). Set `"published": true`.
Stories with `"published": false` are not built at all — the *Ravi & Saloni* story is waiting there for real photos.

### Sections that appear when you add content

* `testimonials.items` — real client words: `{ "quote": "…", "name": "Priya & Arjun", "detail": "Udaipur, 2025" }`
* `faq.items` — `{ "q": "…", "a": "…" }`
* `services.items[].from` — a starting price, e.g. `"₹1,50,000"`
* `contact.instagram` — full profile URL
* `contact.formEndpoint` — a Formspree / Web3Forms URL to receive enquiries by **email** too. Without it, the form opens WhatsApp with the enquiry written out.

---

## Working locally

```bash
node build.mjs            # rebuild pages (Node 18+, no npm install needed)
node tools/check.mjs      # run the quality gate
python3 -m http.server    # preview at http://localhost:8000
```

## Deployment

GitHub Pages serves the repository root of `main`. `.nojekyll` switches off Jekyll so files are served as-is.
`.github/workflows/site.yml` builds + checks every push and pull request, and on `main` commits regenerated pages.

## Design notes

* Type: *Instrument Serif* (display) and *Hanken Grotesk* (text), self-hosted, OFL licensed (see `assets/fonts`).
* Colour: ivory `#f3eee6`, ink `#141210`, one sindoor accent `#b23a24` used only for tiny details.
* Breakpoints: phone < 600px, tablet 600–1023px, desktop ≥ 1024px; landscape phones/tablets get their own hero rules.
* Motion respects "reduce motion" settings: the letterbox intro, reel pinning, autoplay and Ken Burns all switch off.
* BTS reels only load when you scroll near them, and don't autoplay when the phone is in data-saver mode.
