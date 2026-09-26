#!/usr/bin/env python3
"""
Turn full-resolution originals into web-ready, responsive images.

    python3 tools/prepare_images.py media-src/

For every JPG/PNG/TIFF in the folder it writes, into assets/media/:
    <slug>-480.webp, -800, -1200, -1600, -2400 (never upscaled)
    <slug>.jpg      (a 1600px JPEG fallback, also used for social previews)
and records the real width/height in assets/media/manifest.json so the
pages can reserve the right space before the photo loads (no layout jump).

The slug is the file name, lower-cased, e.g. "River Bride.JPG" -> "river-bride".
Originals stay in media-src/, which is git-ignored, so full-resolution files
are never published.

Requires Pillow (pip install pillow).
"""
from __future__ import annotations

import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "media"
MANIFEST = OUT / "manifest.json"
WIDTHS = [480, 800, 1200, 1600, 2400]
EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "image"


def to_srgb(im: Image.Image) -> Image.Image:
    """Convert embedded colour profiles (Adobe RGB, Display P3...) to sRGB so
    colours look the same in every browser, then drop the profile."""
    icc = im.info.get("icc_profile")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            dst = ImageCms.createProfile("sRGB")
            im = ImageCms.profileToProfile(im, src, dst, outputMode="RGB")
        except Exception:  # unreadable profile: fall back to plain conversion
            pass
    return im.convert("RGB")


def process(path: Path, manifest: dict) -> None:
    slug = slugify(path.stem)
    im = to_srgb(ImageOps.exif_transpose(Image.open(path)))
    w, h = im.size
    made = []
    for target in WIDTHS:
        tw = min(target, w)
        if made and tw <= made[-1]:
            break
        th = round(h * tw / w)
        im.resize((tw, th), Image.LANCZOS).save(
            OUT / f"{slug}-{tw}.webp", "WEBP", quality=80, method=6
        )
        made.append(tw)
    fw = min(1600, w)
    im.resize((fw, round(h * fw / w)), Image.LANCZOS).save(
        OUT / f"{slug}.jpg", "JPEG", quality=82, optimize=True, progressive=True
    )
    # A ~24px blurred preview, inlined into the page so the frame shows the
    # photo's colours instantly while the real file loads.
    buf = io.BytesIO()
    im.resize((24, max(1, round(h * 24 / w))), Image.LANCZOS).save(buf, "WEBP", quality=40)
    lqip = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    manifest[slug] = {"width": w, "height": h, "widths": made, "lqip": lqip}
    print(f"  {path.name:28s} -> {slug}  {w}x{h}  {made}")


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "media-src")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in EXTS)
    if not files:
        sys.exit(f"No images found in {src}")
    print(f"Preparing {len(files)} image(s) from {src}")
    for p in files:
        process(p, manifest)
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    print(f"Updated {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
