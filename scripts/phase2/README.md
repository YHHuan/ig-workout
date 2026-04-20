# Phase 2 setup — R2 + Supabase

## 1. What you (Salmon) need to create

### a) Cloudflare R2 bucket

1. Cloudflare dashboard → R2 → **Create bucket**
   - Name: `workout-clips`
   - Location hint: Asia-Pacific
2. After creation, open the bucket → **Settings** → **Public access** →
   enable the **r2.dev subdomain** (free, fine for Phase 2). You'll get a URL
   like `https://pub-xxxxxxxx.r2.dev`.
3. R2 overview page → **Manage R2 API Tokens** → **Create API token**
   - Permissions: **Object Read & Write**
   - Specify bucket: `workout-clips` only
   - TTL: no expiry
   - Copy the three values immediately (shown once):
     - Access Key ID
     - Secret Access Key
     - S3 endpoint (looks like `https://<account-id>.r2.cloudflarestorage.com`)

Free tier is 10 GB storage + 1M Class-A writes/mo + unlimited egress from
Cloudflare's network. Current 17 clips = 32 MB. 100 clips ≈ 190 MB. Safe.

### b) Supabase project

1. https://supabase.com → **New project**
   - Org: personal
   - Name: `ig-workout`
   - Region: `ap-northeast-1` (Tokyo) — closest to Taiwan
   - DB password: generate strong, store in Bitwarden
2. Once ready, **Project Settings** → **API**:
   - Project URL
   - `anon` public key (client-readable)
   - `service_role` key (server-only — **never ship to the site bundle**)
3. **Project Settings** → **Database** → **Connection string** (URI mode,
   includes password) — this is what we'll use to apply the schema.

Free tier: 500 MB DB + 2 GB egress/mo. We'll use ~10 KB for metadata. Fine.

## 2. What I (Claude) prepared in parallel

- `worker/sql/schema.sql` — `workout` schema with `clips` + `ingest_jobs`
  tables, indexes, RLS, updated_at trigger. Idempotent (`create table if
  not exists`).
- `scripts/phase2/migrate.mjs` — one-shot Node script that:
  1. Reads `site/src/data/clips.json`
  2. Uploads every `site/public/clips/*.mp4` + `site/public/thumbs/*.jpg`
     to R2 under `clips/<id>.mp4` and `thumbs/<id>.jpg`
  3. Inserts matching rows into `workout.clips` using the service_role key
  - Safe to re-run: R2 uploads are idempotent by key, Supabase insert uses
    `upsert({ onConflict: 'id' })`.

## 3. Handoff — paste these into `.env` at repo root

```
# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=workout-clips
R2_PUBLIC_BASE=https://pub-xxxxxxxx.r2.dev     # the r2.dev URL

# Supabase
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres:...@db.xxxxxxxx.supabase.co:5432/postgres
```

`.env` is already in `.gitignore`. Do NOT paste service_role key into any
file that gets committed.

## 4. Run order once creds land

```bash
# from repo root
psql "$SUPABASE_DB_URL" -f worker/sql/schema.sql      # apply schema
node scripts/phase2/migrate.mjs                        # upload 17 clips to R2 + rows to DB
```

Then I'll refactor `site/src/lib/clips.ts` to build-time-fetch from Supabase
(keeping `clips.json` as an offline fallback so dev without creds still
builds), remove `site/public/clips/` + `site/public/thumbs/` from the repo,
and the ig-workout repo itself drops from 32 MB to ~0.

After that: batch-ingest the 32 new Reels (manual hand-cut via
`scripts/reencode.sh`, then `node scripts/phase2/migrate.mjs` again to push
to R2 + DB). Phase 3 automates the hand-cut with Gemini.
