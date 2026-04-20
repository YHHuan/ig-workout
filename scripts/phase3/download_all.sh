#!/usr/bin/env bash
# Batch-download all 29 new IG Reels into scripts/phase3/raw/<shortcode>/NN.mp4
# + <shortcode>/NN.info.json (captions). Idempotent-ish: skips posts whose
# dir already has any .mp4 file.
#
# Usage: bash scripts/phase3/download_all.sh

set -u
cd "$(dirname "$0")/raw"

URLS=(
  "https://www.instagram.com/p/DN0OJJb0J_o/"
  "https://www.instagram.com/p/DNiKEQoIm5I/"
  "https://www.instagram.com/p/DJerwpVxUR1/"
  "https://www.instagram.com/p/DN23RCU0Cnc/"
  "https://www.instagram.com/p/DKfWGIStm6H/"
  "https://www.instagram.com/p/DN3fc4G4ptW/"
  "https://www.instagram.com/p/DNU8wyuNlv_/"
  "https://www.instagram.com/p/DNLBLseNcsY/"
  "https://www.instagram.com/p/DOIlH0aiHdX/"
  "https://www.instagram.com/p/DOiaWDuiO12/"
  "https://www.instagram.com/p/DPOuyg6DpR8/"
  "https://www.instagram.com/p/DOs02E2jzsr/"
  "https://www.instagram.com/p/DPRERK7CNCp/"
  "https://www.instagram.com/p/DPZXFcmDs6q/"
  "https://www.instagram.com/p/DRH_ah_CHm3/"
  "https://www.instagram.com/p/DRZ2GPYiBX4/"
  "https://www.instagram.com/p/DQxcM2TEa4h/"
  "https://www.instagram.com/p/DOoILgMCI5A/"
  "https://www.instagram.com/p/DRlW3ubE__k/"
  "https://www.instagram.com/p/DLGdinqJrvA/"
  "https://www.instagram.com/p/DSrEY9kkQdJ/"
  "https://www.instagram.com/p/DSxQ_BmCITB/"
  "https://www.instagram.com/p/DTC9kbVCJEB/"
  "https://www.instagram.com/p/DTx6lnYiADs/"
  "https://www.instagram.com/p/DT0j7vLCLv_/"
  "https://www.instagram.com/p/DUK9EhsiFza/"
  "https://www.instagram.com/p/CvpJrqPJ_ON/"
  "https://www.instagram.com/p/DPBiBomksz-/"
  "https://www.instagram.com/p/DT6JGR1iPuf/"
)

: > download_log.txt

ok=0
fail=0
skip=0
i=0
total=${#URLS[@]}

for url in "${URLS[@]}"; do
  i=$((i+1))
  shortcode=$(echo "$url" | sed -E 's|.*/p/([^/?]+).*|\1|')
  printf '[%2d/%d] %s ... ' "$i" "$total" "$shortcode"

  if compgen -G "$shortcode/*.mp4" > /dev/null 2>&1; then
    nfiles=$(ls "$shortcode"/*.mp4 2>/dev/null | wc -l)
    echo "SKIP (already $nfiles mp4s)"
    echo "[skip] $shortcode ($nfiles mp4s)" >> download_log.txt
    skip=$((skip+1))
    continue
  fi

  mkdir -p "$shortcode"
  if python -m yt_dlp \
      --no-warnings --quiet \
      --write-info-json \
      -o "$shortcode/%(playlist_index)02d.%(ext)s" \
      "$url" >> download_log.txt 2>&1; then
    nfiles=$(ls "$shortcode"/*.mp4 2>/dev/null | wc -l)
    if [ "$nfiles" -gt 0 ]; then
      echo "OK ($nfiles mp4s)"
      echo "[ok] $shortcode: $nfiles mp4s" >> download_log.txt
      ok=$((ok+1))
    else
      echo "NO-VIDEO (carousel has no video?)"
      echo "[no-video] $shortcode" >> download_log.txt
      fail=$((fail+1))
    fi
  else
    echo "FAIL (see download_log.txt)"
    echo "[fail] $shortcode" >> download_log.txt
    fail=$((fail+1))
  fi

  # Gentle pacing for IG
  sleep 2
done

echo ""
echo "===== summary ====="
echo "ok:   $ok"
echo "skip: $skip"
echo "fail: $fail"
echo "total posts: $total"
