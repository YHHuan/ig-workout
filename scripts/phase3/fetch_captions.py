#!/usr/bin/env python3
"""Fetch public OG metadata (title + description) for each post short code
and save to captions.json. No IG login required.
"""
import html as htmllib
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "captions.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Post shortcodes — derived from the subdirs in raw/
shortcodes = sorted([d.name for d in RAW.iterdir() if d.is_dir()])

results = {}
for i, code in enumerate(shortcodes, 1):
    url = f"https://www.instagram.com/p/{code}/"
    print(f"[{i:2d}/{len(shortcodes)}] {code} ...", end=" ", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"FAIL ({e})")
        results[code] = {"error": str(e)}
        continue

    def grab(prop):
        m = re.search(rf'<meta property="{prop}" content="([^"]+)"', body)
        return htmllib.unescape(m.group(1)) if m else None

    og_title = grab("og:title")
    og_desc = grab("og:description")

    # Count how many mp4s we have for this post
    nfiles = len(list((RAW / code).glob("*.mp4")))

    results[code] = {
        "url": url,
        "og_title": og_title,
        "og_description": og_desc,
        "n_videos": nfiles,
    }
    print(f"OK ({nfiles} videos, caption={len(og_desc or '')} chars)")
    time.sleep(1.5)

OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\nSaved {len(results)} entries to {OUT}")
