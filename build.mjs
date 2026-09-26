#!/usr/bin/env node
// Builds the static site from content/site.json.
//   node build.mjs          -> writes index.html, stories/*/index.html, 404.html, sitemap.xml, robots.txt
// No dependencies; runs on Node 18+.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { ROOT } from "./src/lib.mjs";
import { layout, home, story, notFound } from "./src/render.mjs";

const content = JSON.parse(readFileSync(join(ROOT, "content/site.json"), "utf8"));
const hash = (p) => createHash("sha1").update(readFileSync(join(ROOT, p))).digest("hex").slice(0, 10);
const v = { css: hash("assets/css/site.css"), js: hash("assets/js/site.js") };
const imagekit = content.site.imagekit;
const written = [];

function write(rel, html) {
  const out = join(ROOT, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  written.push(rel);
}

// ---- home
{
  const ctx = { base: "", imagekit };
  const { body, preload } = home(content, ctx);
  write("index.html", layout(content, { base: "", path: "/", isHome: true, ctx, body, preload, v, bodyClass: "page-home" }));
}

// ---- stories (remove pages for stories that were unpublished or deleted)
const published = content.stories.items.filter((s) => s.published);
const storiesDir = join(ROOT, "stories");
if (existsSync(storiesDir)) {
  for (const d of readdirSync(storiesDir)) {
    if (!published.some((s) => s.slug === d)) rmSync(join(storiesDir, d), { recursive: true, force: true });
  }
}
for (const s of published) {
  const ctx = { base: "../../", imagekit };
  const { body, preload } = story(content, s, ctx, published);
  write(`stories/${s.slug}/index.html`, layout(content, {
    base: "../../",
    path: `/stories/${s.slug}/`,
    ctx, body, preload, v,
    bodyClass: "page-story",
    title: `${s.couple} — ${s.place.split(",")[0]} wedding | ${content.site.name}`,
    description: s.summary || content.site.description,
    shareImage: s.cover,
  }));
}

// ---- 404 (served by GitHub Pages at any depth, so it uses root-absolute paths)
{
  const ctx = { base: "/", imagekit };
  write("404.html", layout(content, {
    base: "/", path: "/404.html", ctx, body: notFound(content), v, bodyClass: "page-404",
    title: `Page not found | ${content.site.name}`,
  }));
}

// ---- sitemap, robots, web manifest
const site = content.site.url.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const urls = ["/", ...published.map((s) => `/stories/${s.slug}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${site}${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /tools/\nDisallow: /src/\nDisallow: /content/\n\nSitemap: ${site}/sitemap.xml\n`);
write("site.webmanifest", JSON.stringify({
  name: content.site.name,
  short_name: "Reel Romance",
  start_url: "/",
  display: "browser",
  background_color: "#f3eee6",
  theme_color: "#141210",
  icons: [
    { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
}, null, 2) + "\n");

console.log(`Built ${written.length} files:\n  ${written.join("\n  ")}`);
