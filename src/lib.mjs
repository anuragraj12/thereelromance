// Shared helpers for the static site build. No dependencies.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("..", import.meta.url).pathname;

// ---------------------------------------------------------------- text
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Escape, then turn *words* into <em>words</em> (the only markup copy needs). */
export const md = (s = "") => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

/** Plain text version of a marked-up string, for meta tags and aria labels. */
export const plain = (s = "") => String(s).replace(/\*/g, "");

export const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(" ");

export const pad = (n) => String(n).padStart(2, "0");

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------- images
const MANIFEST_PATH = join(ROOT, "assets/media/manifest.json");
export const manifest = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  : {};

const IK_WIDTHS = [480, 800, 1200, 1600, 2400];

function parseRatio(r) {
  if (!r) return null;
  if (typeof r === "number") return r;
  const [a, b] = String(r).split(/[/:x]/).map(Number);
  return a && b ? a / b : null;
}

/**
 * Resolve a content image into everything an <img> needs.
 * `base` is the relative path from the current page to the site root.
 */
export function resolveImage(img, { base = "", imagekit = "" } = {}) {
  if (!img || !img.src) return null;
  const src = String(img.src).trim();

  if (src.startsWith("local:")) {
    const slug = src.slice(6);
    const m = manifest[slug];
    if (!m) throw new Error(`Image "${src}" is not in assets/media/manifest.json. Run tools/prepare_images.py first.`);
    const url = (w) => `${base}assets/media/${slug}-${w}.webp`;
    const fallbackW = m.widths.filter((w) => w <= 1600).pop() || m.widths[0];
    return {
      src: url(fallbackW),
      srcset: m.widths.map((w) => `${url(w)} ${w}w`).join(", "),
      width: m.width,
      height: m.height,
      ratio: m.width / m.height,
      lqip: m.lqip,
      jpg: `${base}assets/media/${slug}.jpg`,
    };
  }

  let url = src;
  if (src.startsWith("ik:")) url = imagekit + src.slice(3).replace(/^\/+/, "");
  const ratio = parseRatio(img.ratio);

  if (/ik\.imagekit\.io/.test(url)) {
    // Strip any transformation the editor pasted; we build our own per width.
    const clean = url.replace(/\?.*$/, "");
    const at = (w) => `${clean}?tr=w-${w},q-80,f-auto`;
    return {
      src: at(1600),
      srcset: IK_WIDTHS.map((w) => `${at(w)} ${w}w`).join(", "),
      ratio,
      width: ratio ? 1600 : undefined,
      height: ratio ? Math.round(1600 / ratio) : undefined,
      jpg: `${clean}?tr=w-1200,h-630,fo-auto,q-80,f-jpg`,
    };
  }
  return { src: url, srcset: "", ratio, jpg: url };
}

/**
 * <img> that FILLS a frame whose shape is set by the layout (object-fit: cover).
 * Never distorts; `focus` / `focusMobile` choose what stays in view.
 */
export function fillImg(img, ctx, { sizes = "100vw", eager = false, cls = "" } = {}) {
  const r = resolveImage(img, ctx);
  if (!r) return "";
  const style = [
    img.focus && `--focus:${img.focus}`,
    img.focusMobile && `--focus-m:${img.focusMobile}`,
    r.lqip && `background-image:url(${r.lqip})`,
  ].filter(Boolean).join(";");
  return `<img ${attrs({
    class: `fill ${cls}`.trim(),
    src: r.src,
    srcset: r.srcset,
    sizes: r.srcset ? sizes : undefined,
    alt: img.alt || "",
    width: r.width,
    height: r.height,
    loading: eager ? "eager" : "lazy",
    decoding: eager ? "sync" : "async",
    fetchpriority: eager ? "high" : undefined,
    style,
  })}>`;
}

/**
 * <img> that keeps its OWN shape (galleries, the reel). The layout adapts to
 * the photo. --ar is refined from the real file by JS once it loads.
 */
export function naturalImg(img, ctx, { sizes = "50vw", cls = "" } = {}) {
  const r = resolveImage(img, ctx);
  if (!r) return "";
  const ar = r.ratio ? +r.ratio.toFixed(4) : 1.5;
  const style = [`--ar:${ar}`, r.lqip && `background-image:url(${r.lqip})`].filter(Boolean).join(";");
  return `<img ${attrs({
    class: `natural ${cls}`.trim(),
    src: r.src,
    srcset: r.srcset,
    sizes: r.srcset ? sizes : undefined,
    alt: img.alt || "",
    width: r.width,
    height: r.height,
    loading: "lazy",
    decoding: "async",
    style,
  })}>`;
}

// ---------------------------------------------------------------- misc
export const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
export const waLink = (num, text = "") =>
  `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
