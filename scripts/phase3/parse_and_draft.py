#!/usr/bin/env python3
"""Parse captions.json + raw/ inventory → clips_draft.json

One clips.json-shaped entry per downloaded video (149 total for current batch).

Strategy:
  * Try several patterns to extract a numbered exercise list from each caption.
  * If the extracted list's size roughly matches the video count, use it.
  * Else leave exercise_name blank; UI will show a dashed amber "needs review" border.
  * Infer category + equipment from whatever text we have.

Field conventions follow site/src/data/clips.json (clip_key / thumb_key shape).
"""

import html as htmllib
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
CAPTIONS = json.loads((HERE / "captions.json").read_text(encoding="utf-8"))
OUT = HERE / "clips_draft.json"

# --- helpers ----------------------------------------------------------------

EMOJI_DIGITS = {
    "1️⃣": "1", "2️⃣": "2", "3️⃣": "3", "4️⃣": "4", "5️⃣": "5",
    "6️⃣": "6", "7️⃣": "7", "8️⃣": "8", "9️⃣": "9", "🔟": "10",
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
    "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
    "⑪": "11", "⑫": "12",
}

FLUFF = re.compile(
    r"^(follow|save|share|like|comment|dm|link|bio|tag|watch|subscribe|check)",
    re.IGNORECASE,
)


def slugify(shortcode: str) -> str:
    """First 6 chars, lowercase, alphanumeric only. Matches existing duscu/dundek/dswbei style."""
    s = re.sub(r"[^A-Za-z0-9]", "", shortcode[:6]).lower()
    if len(s) < 3:
        s = re.sub(r"[^A-Za-z0-9]", "", shortcode).lower()[:6]
    return s


def clean_caption(desc: str) -> str:
    if not desc:
        return ""
    m = re.match(
        r'^[\d,.Kk]+\s*likes?,\s*[\d,.Kk]+\s*comments?\s*-\s*[^:]+:\s*"(.+?)"\s*\.?\s*$',
        desc,
        re.DOTALL,
    )
    return m.group(1) if m else desc


def normalize_emoji_digits(text: str) -> str:
    for k, v in EMOJI_DIGITS.items():
        text = text.replace(k, v + ". ")
    return text


def looks_like_exercise_name(s: str) -> bool:
    if not s or len(s) < 3 or len(s) > 90:
        return False
    if FLUFF.match(s):
        return False
    # Must contain at least one letter
    if not re.search(r"[A-Za-z\u4e00-\u9fff]", s):
        return False
    return True


def strip_trailing_noise(s: str) -> str:
    s = s.strip()
    # Strip leading punctuation left over from sloppy list prefixes like "2..foo" or "- foo"
    s = s.lstrip(" .,:;-—–·•")
    # Strip trailing rep/time info like "3x10-12" or "30s" or "for 45s"
    s = re.sub(r"\s+(?:\d+\s*[x×]\s*\d+(?:[-–]\d+)?|\d+\s*s(?:econds?)?|for\s+\d+.*)$", "", s)
    # Strip trailing punctuation
    s = s.rstrip(" .,:;-—–")
    # Collapse repeated spaces
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def extract_numbered_list(caption: str, n_expected: int):
    """Return {1: 'Name', 2: 'Name', …} best-effort."""
    caption = normalize_emoji_digits(caption)
    items = {}

    # Pattern A: "^\s*1[.):]\s+Foo"
    for line in caption.split("\n"):
        m = re.match(r"^\s*(\d{1,2})\s*[.):\-]\s*(.{3,100}?)\s*$", line)
        if m:
            n = int(m.group(1))
            if not (1 <= n <= 20):
                continue
            name = strip_trailing_noise(m.group(2))
            if looks_like_exercise_name(name) and n not in items:
                items[n] = name

    # Pattern B: "Ex 3: Foo" or "Slide 3 - Foo" (inline, not always on own line)
    for m in re.finditer(
        r"(?:Ex(?:ercise)?|Slide)\s*(\d{1,2})\s*[:.\-–]\s*([^\n]{3,120})",
        caption,
        re.IGNORECASE,
    ):
        n = int(m.group(1))
        if not (1 <= n <= 20):
            continue
        name = strip_trailing_noise(m.group(2))
        # For "Slide" format the trailing text is often a full sentence — keep only up to colon/period
        name = re.split(r"[.:;]\s", name, 1)[0].strip()
        name = strip_trailing_noise(name)
        if looks_like_exercise_name(name) and n not in items:
            items[n] = name

    return items


# --- category + equipment inference ------------------------------------------

CATEGORY_RULES = [
    ("mobility", r"\b(mobility|stretch|flow|90-?90|cat-?cow|hip opener|warm[- ]?up|cool[- ]?down|foam roll|pigeon)\b"),
    ("core", r"\b(plank|dead ?bug|bird ?dog|pallof|carry|anti[- ]?rotation|oblique|russian twist|wood ?chop|hollow ?hold|toe tap|sit[- ]?up|crunch|leg raise|roll ?out|v[- ]?up|copenhagen)\b"),
    ("full_body", r"\b(sprint|plyo|explosive|burpee|complex|full[- ]?body|snatch|clean|thruster|skater|bound|jump squat|broad jump|box jump|tuck jump|pogo|kettlebell swing|kb swing|landmine)\b"),
    ("legs", r"\b(squat|lunge|deadlift|rdl|hip thrust|glute bridge|calf|leg press|step[- ]?up|bulgarian|hack|adductor|abductor|knee extension|knee flex|goblet|split[- ]?stance|curtsy)\b"),
    ("upper", r"\b(press|row|pull[- ]?up|chin[- ]?up|dip|push[- ]?up|bench|curl|lat|face pull|shoulder|tricep|bicep|chest fly|back fly|rear delt|overhead|y[- ]?raise|t[- ]?raise|upright row|landmine press)\b"),
]


def infer_category(*texts: str) -> str:
    t = " ".join(texts).lower()
    for cat, pat in CATEGORY_RULES:
        if re.search(pat, t):
            return cat
    return "core"  # benign default


EQUIPMENT_RULES = [
    (r"\bbarbell|\bbb\b", "barbell"),
    (r"\bdumb ?bells?|\bdb\b", "dumbbell"),
    (r"\bkettle ?bells?|\bkb\b", "kettlebell"),
    (r"\b(cable|rope|lat pulldown|tricep rope)\b", "cable"),
    (r"\b(resistance.band|power.band|mini.band|\bband\b|tube)", "resistance band"),
    (r"\bbench\b", "bench"),
    (r"\b(box|step|platform|plyo box)\b", "box"),
    (r"\b(med ?ball|medicine ball|slam ball|wall ball)\b", "medicine ball"),
    (r"\bbosu\b", "bosu ball"),
    (r"\blandmine\b", "landmine"),
    (r"\b(weight )?plate\b", "weight plate"),
    (r"\b(slider|sliding disc|valslide|furniture slider)\b", "slider"),
    (r"\btrx|suspension\b", "TRX"),
    (r"\b(sled|prowler)\b", "sled"),
    (r"\bfoam roll", "foam roller"),
]


def infer_equipment(*texts: str):
    t = " ".join(texts).lower()
    out = []
    for pat, name in EQUIPMENT_RULES:
        if re.search(pat, t) and name not in out:
            out.append(name)
    return out


# --- main --------------------------------------------------------------------

draft = []
stats = {"parsed_full": 0, "parsed_partial": 0, "parsed_none": 0, "n_total": 0}

for code in sorted(CAPTIONS.keys()):
    entry = CAPTIONS[code]
    n = entry.get("n_videos", 0)
    if n == 0:
        continue
    slug = slugify(code)

    cap_raw = htmllib.unescape(entry.get("og_description") or "")
    cap = clean_caption(cap_raw)
    title_raw = htmllib.unescape(entry.get("og_title") or "")
    title = clean_caption(title_raw)

    items = extract_numbered_list(cap, n)

    # Partial-list heuristics: only trust if the max index seen is within [n-1, n+1]
    max_idx = max(items.keys()) if items else 0
    usable = items if (n and max_idx and abs(max_idx - n) <= 1) else {}

    n_filled = sum(1 for i in range(1, n + 1) if usable.get(i))
    if n_filled == n:
        stats["parsed_full"] += 1
    elif n_filled > 0:
        stats["parsed_partial"] += 1
    else:
        stats["parsed_none"] += 1

    for i in range(1, n + 1):
        name = usable.get(i, "") or ""
        # Category: prefer name-derived, fall back to caption-derived
        cat = infer_category(name) if name else infer_category(title, cap[:400])
        eq = infer_equipment(name, cap[:300])
        # Confidence: 0.8 for short clean names, 0.5 for suspect ones (triggers amber UI),
        # 0.0 for blanks (also triggers amber).
        if not name:
            conf = 0.0
        elif len(name.split()) > 6 or re.search(r"\b(like|hidden|flipping|switch|precisely)\b", name, re.I):
            conf = 0.5
        else:
            conf = 0.8

        draft.append({
            "id": f"{slug}-{i:02d}",
            "exercise_name": name,
            "category": cat,
            "clip_key": f"clips/{slug}-{i:02d}.mp4",
            "thumb_key": f"thumbs/{slug}-{i:02d}.jpg",
            "form_cues": [],
            "muscle_group": None,
            "equipment": eq,
            "source_url": f"https://www.instagram.com/p/{code}/",
            "exercise_name_confidence": conf,
            "_raw_path": f"raw/{code}/{i:02d}.mp4",  # internal — stripped before commit
        })
        stats["n_total"] += 1

OUT.write_text(json.dumps(draft, indent=2, ensure_ascii=False), encoding="utf-8")

print(f"=== parse summary ===")
print(f"  posts w/ all names parsed:   {stats['parsed_full']}")
print(f"  posts w/ some names parsed:  {stats['parsed_partial']}")
print(f"  posts w/ no names parsed:    {stats['parsed_none']}")
print(f"  total draft clip entries:    {stats['n_total']}")
print(f"  written: {OUT}")
