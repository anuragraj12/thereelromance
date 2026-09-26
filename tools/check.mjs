#!/usr/bin/env node
// Quality gate for the site. Run after `node build.mjs`:
//   node tools/check.mjs
// Fails (exit 1) on problems that would hurt visitors; warns on the rest.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const content = JSON.parse(readFileSync(join(ROOT, "content/site.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "assets/media/manifest.json"), "utf8"));
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

// ---------------------------------------------------------------- content
const STOCK = /(unsplash\.com|pexels\.com|pixabay\.com|shutterstock|istockphoto|gettyimages|freepik)/i;
function checkImage(img, where, { needsAlt = true } = {}) {
  if (!img || !img.src) return;
  const src = String(img.src);
  if (STOCK.test(src)) err(`${where}: stock-photo URL (${src}). Only use your own work.`);
  if (needsAlt && !(img.alt || "").trim()) err(`${where}: missing "alt" text (describe the photo for screen readers and Google).`);
  if (src.startsWith("local:") && !manifest[src.slice(6)]) err(`${where}: "${src}" not found — run tools/prepare_images.py.`);
  if (/^https?:/.test(src) && !/ik\.imagekit\.io/.test(src)) warn(`${where}: ${src} is not on ImageKit, so no responsive sizes are generated.`);
  for (const k of ["focus", "focusMobile"]) {
    if (img[k] && !/^\s*-?\d+(\.\d+)?%\s+-?\d+(\.\d+)?%\s*$/.test(img[k])) err(`${where}: ${k} "${img[k]}" should look like "50% 30%".`);
  }
}

const c = content;
c.hero.slides.forEach((s, i) => checkImage(s, `hero.slides[${i}]`));
if (c.hero.slides.length === 0) err("hero.slides is empty.");
c.prologue.images.forEach((s, i) => checkImage(s, `prologue.images[${i}]`));
c.frames.items.forEach((s, i) => checkImage(s, `frames.items[${i}]`));
c.films.items.forEach((f, i) => {
  if (!/^[\w-]{11}$/.test(f.youtube || "")) err(`films.items[${i}]: "youtube" must be the 11-character video id.`);
  checkImage(f.poster, `films.items[${i}].poster`);
});
const slugs = new Set();
c.stories.items.forEach((s, i) => {
  const w = `stories.items[${i}] (${s.couple})`;
  if (!/^[a-z0-9-]+$/.test(s.slug || "")) err(`${w}: slug must be lowercase letters, numbers and dashes.`);
  if (slugs.has(s.slug)) err(`${w}: duplicate slug "${s.slug}".`);
  slugs.add(s.slug);
  if (!s.published) return;
  if (!s.cover?.src) err(`${w}: published stories need a cover image.`);
  if (!s.summary) err(`${w}: published stories need a summary.`);
  if (!s.gallery?.length) warn(`${w}: gallery is empty.`);
  if (s.date && Number.isNaN(Date.parse(s.date))) err(`${w}: date should look like 2026-04-26.`);
  checkImage(s.cover, `${w}.cover`);
  (s.gallery || []).forEach((g, j) => checkImage(g, `${w}.gallery[${j}]`));
  (s.bts || []).forEach((id) => { if (!c.bts.items.some((b) => b.id === id)) err(`${w}: bts id "${id}" is not in bts.items.`); });
});
c.services.items.forEach((s, i) => checkImage(s.image, `services.items[${i}].image`, { needsAlt: false }));
c.bts.items.forEach((v, i) => { if (/catbox\.moe/.test(v.src)) warn(`bts.items[${i}]: catbox.moe is a free file host with no uptime promise — consider ImageKit video or YouTube Shorts.`); });
if (!/^\d{10,15}$/.test(c.contact.whatsapp)) err(`contact.whatsapp should be digits only with country code, e.g. 918800168227.`);
if (c.contact.email && !c.contact.email.endsWith("@" + new URL(c.site.url).hostname)) warn(`contact.email (${c.contact.email}) is not on ${new URL(c.site.url).hostname}; make sure that mailbox exists.`);

// ---------------------------------------------------------------- built pages
const pages = ["index.html", "404.html"];
const storyDir = join(ROOT, "stories");
if (existsSync(storyDir)) for (const d of readdirSync(storyDir)) pages.push(`stories/${d}/index.html`);
for (const p of pages) {
  const file = join(ROOT, p);
  if (!existsSync(file)) { err(`${p} was not built — run node build.mjs.`); continue; }
  const html = readFileSync(file, "utf8");
  if (/\b(undefined|NaN)\b|\[object Object\]/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) err(`${p}: contains "undefined"/"NaN" — a content field is missing.`);
  if (STOCK.test(html)) err(`${p}: contains a stock-photo URL.`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) err(`${p}: should have exactly one <h1>.`);
  const imgs = html.match(/<img\b[^>]*>/g) || [];
  imgs.forEach((t) => { if (!/\balt="/.test(t)) err(`${p}: <img> without alt: ${t.slice(0, 80)}`); });
  // local references must exist
  const base = p === "404.html" ? ROOT : dirname(file);
  const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1])
    .concat([...html.matchAll(/srcset="([^"]+)"/g)].flatMap((m) => m[1].split(/,\s+/).map((s) => s.trim().split(/\s/)[0])));
  for (const r of refs) {
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(r) || r === "") continue;
    const target = r.startsWith("/") ? join(ROOT, r) : resolve(base, r);
    const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
    if (!ok) err(`${p}: broken link/asset "${r}".`);
  }
}

// ---------------------------------------------------------------- report
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${pages.length} page(s).`);
process.exit(errors.length ? 1 : 0);
