# ig-workout

Personal workout clip library. Instagram Reels → Gemini-segmented exercise clips → mobile PWA gallery.

**Single user. Not shared. Not commercial.**

## Repo layout

```
ig-workout/
├── site/       # Astro 5 + Tailwind 4 + PWA → Cloudflare Pages
├── worker/     # FastAPI + ffmpeg + Gemini → Railway (added in Phase 3)
└── infra/      # Supabase schema, R2 CORS, cobalt compose (added in Phase 2/3)
```

## Phase status

- [x] Phase 1 — Static MVP with hand-cut clips (Astro + Cloudflare Pages)
- [ ] Phase 2 — R2 + Supabase wiring (build-time fetch from DB)
- [ ] Phase 3 — FastAPI worker + cobalt/yt-dlp download chain
- [ ] Phase 4 — Gemini 3.1 Pro segmentation
- [ ] Phase 5 — Telegram bot trigger
- [ ] Phase 6 — PWA polish (Workbox, PiP, install prompt)

## Local dev

```bash
cd site
npm install
npm run dev
```

## Deploy

- **site/** — pushed to GitHub `main`, auto-builds on Cloudflare Pages
- **worker/** — Railway, manual deploy (added in Phase 3)

## Secrets

See `.env.example`. Real values live in Railway dashboard + local `.env` (git-ignored).
