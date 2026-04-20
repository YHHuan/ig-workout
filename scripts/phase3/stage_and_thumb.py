#!/usr/bin/env python3
"""Stage MP4s into site/public/clips/ (renamed to clip IDs) and generate
JPG thumbnails via ffmpeg. Reads clips_draft.json for the id → raw path map.

After this runs, site/public/{clips,thumbs}/ will contain 149 new files total.
Phase 2 migrate.mjs can then upload them to R2.
"""

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parent.parent
DRAFT = json.loads((HERE / "clips_draft.json").read_text(encoding="utf-8"))
RAW = HERE / "raw"

CLIPS_OUT = REPO / "site" / "public" / "clips"
THUMB_OUT = REPO / "site" / "public" / "thumbs"
CLIPS_OUT.mkdir(parents=True, exist_ok=True)
THUMB_OUT.mkdir(parents=True, exist_ok=True)

ok = fail = skip = 0
errors: list[str] = []
t0 = time.time()

for i, entry in enumerate(DRAFT, 1):
    clip_id = entry["id"]
    raw_rel = entry.get("_raw_path")  # e.g., "raw/DN0OJJb0J_o/01.mp4"
    if not raw_rel:
        errors.append(f"{clip_id}: no _raw_path in draft")
        fail += 1
        continue

    src = HERE / raw_rel
    dst_mp4 = CLIPS_OUT / f"{clip_id}.mp4"
    dst_jpg = THUMB_OUT / f"{clip_id}.jpg"

    if not src.exists():
        errors.append(f"{clip_id}: raw file missing ({src})")
        fail += 1
        continue

    if dst_mp4.exists() and dst_jpg.exists():
        skip += 1
        continue

    # Copy MP4 (fast)
    if not dst_mp4.exists():
        shutil.copy2(src, dst_mp4)

    # Generate thumbnail if missing
    if not dst_jpg.exists():
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(dst_mp4),
            "-frames:v", "1",
            "-vf", "thumbnail,scale=500:-1",
            "-q:v", "3",
            str(dst_jpg),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            errors.append(f"{clip_id}: ffmpeg failed — {e.stderr.strip()[:200]}")
            fail += 1
            # Clean up partial
            if dst_jpg.exists():
                dst_jpg.unlink()
            continue

    ok += 1
    if i % 25 == 0 or i == len(DRAFT):
        elapsed = time.time() - t0
        print(f"  [{i}/{len(DRAFT)}] staged in {elapsed:.1f}s "
              f"(ok={ok} skip={skip} fail={fail})")

print("\n=== summary ===")
print(f"  ok:   {ok}")
print(f"  skip: {skip} (already staged)")
print(f"  fail: {fail}")
print(f"  time: {time.time() - t0:.1f}s")
if errors:
    print("\n=== errors ===")
    for e in errors[:20]:
        print(f"  - {e}")
    if len(errors) > 20:
        print(f"  ... and {len(errors) - 20} more")
    sys.exit(1)
