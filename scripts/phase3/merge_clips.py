#!/usr/bin/env python3
"""Merge clips_draft.json into site/src/data/clips.json.

Strips the internal `_raw_path` field. Dedup by id — existing entries win
(so re-running won't clobber hand-edited names). Appends new entries at the end.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parent.parent
LIVE = REPO / "site" / "src" / "data" / "clips.json"
DRAFT = HERE / "clips_draft.json"

live = json.loads(LIVE.read_text(encoding="utf-8"))
draft = json.loads(DRAFT.read_text(encoding="utf-8"))

existing_ids = {c["id"] for c in live}
added = 0
skipped = 0

for entry in draft:
    clip_id = entry["id"]
    # Strip internal fields
    entry = {k: v for k, v in entry.items() if not k.startswith("_")}
    # Drop None-valued optional fields so they don't render as "null"
    entry = {k: v for k, v in entry.items() if v is not None}
    # Drop empty lists for equipment (keep other empty lists like form_cues since
    # site already ships empty form_cues on some entries)
    if entry.get("equipment") == []:
        entry.pop("equipment", None)
    if entry.get("form_cues") == [] and "form_cues" in entry:
        # keep form_cues even if empty — schema expects the field
        pass

    if clip_id in existing_ids:
        skipped += 1
        continue

    live.append(entry)
    existing_ids.add(clip_id)
    added += 1

LIVE.write_text(json.dumps(live, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"  merged: +{added} new, {skipped} already present")
print(f"  total clips in site/src/data/clips.json: {len(live)}")
