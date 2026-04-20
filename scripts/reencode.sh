#!/usr/bin/env bash
# Phase 1 helper: re-encode a source mp4 to web-safe H.264 + generate a midpoint thumb.
#
# Usage:
#   scripts/reencode.sh <input.mp4> <output-id> [start_seconds] [end_seconds]
#
# - Emits site/public/clips/<output-id>.mp4   (H.264 High@L4.0, CRF 20, no audio, +faststart)
# - Emits site/public/thumbs/<output-id>.jpg  (360px wide, midpoint frame)
# - If start/end given, applies -ss/-to to cut a sub-segment; otherwise re-encodes the full file.
#
# Matches the ffmpeg flags spec'd in plan §4 step 4.

set -euo pipefail

INPUT="${1:?input mp4 required}"
ID="${2:?output id required}"
START="${3:-}"
END="${4:-}"

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)/site"
CLIP_OUT="$SITE_DIR/public/clips/$ID.mp4"
THUMB_OUT="$SITE_DIR/public/thumbs/$ID.jpg"

cut_args=()
if [[ -n "$START" ]]; then cut_args+=(-ss "$START"); fi
if [[ -n "$END"   ]]; then cut_args+=(-to "$END");   fi

ffmpeg -hide_banner -loglevel error -y \
  "${cut_args[@]}" \
  -i "$INPUT" \
  -c:v libx264 -crf 20 -preset medium \
  -profile:v high -level:v 4.0 -pix_fmt yuv420p \
  -an -movflags +faststart \
  -vf "scale='min(720,iw)':-2" \
  "$CLIP_OUT"

# Midpoint thumbnail
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLIP_OUT")
mid=$(awk -v d="$duration" 'BEGIN{printf "%.2f", d/2}')

ffmpeg -hide_banner -loglevel error -y \
  -ss "$mid" -i "$CLIP_OUT" \
  -frames:v 1 -vf "scale=360:-2" \
  -q:v 4 \
  "$THUMB_OUT"

printf "✔ %-24s → %6.2fs  %s → %s\n" "$ID" "$duration" "$(basename "$INPUT")" "$(basename "$CLIP_OUT")"
