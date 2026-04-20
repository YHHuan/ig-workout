#!/usr/bin/env node
// scripts/phase2/migrate.mjs
//
// One-shot migration: push every clip currently in site/src/data/clips.json
// (and its matching MP4 + JPG in site/public/) to R2, then upsert rows into
// Supabase workout.clips.
//
// Safe to re-run — R2 PutObject is idempotent by key, and the DB insert is an
// upsert on `id`. No deletes.
//
// Env vars required (pulled from .env at repo root via `node --env-file`):
//   R2_ACCOUNT_ID  R2_ACCESS_KEY_ID  R2_SECRET_ACCESS_KEY  R2_BUCKET
//   SUPABASE_URL  SUPABASE_SERVICE_ROLE_KEY
//
// Usage:
//   node --env-file=.env scripts/phase2/migrate.mjs
//   node --env-file=.env scripts/phase2/migrate.mjs --dry-run
//   node --env-file=.env scripts/phase2/migrate.mjs --only=duscu-01,dswbei-02

import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---- CLI ---------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);
const onlySet = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null;

// ---- Env ---------------------------------------------------------------
const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`[fatal] missing env var: ${k}`);
    process.exit(1);
  }
  return v;
};
const R2_ACCOUNT_ID         = need('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID      = need('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY  = need('R2_SECRET_ACCESS_KEY');
const R2_BUCKET             = need('R2_BUCKET');
const SUPABASE_DB_URL       = need('SUPABASE_DB_URL');

// ---- Clients -----------------------------------------------------------
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const pgClient = new pg.Client({
  connectionString: SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// ---- Helpers -----------------------------------------------------------
async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return false;
    throw e;
  }
}

async function uploadFile(absPath, key, contentType) {
  const size = (await stat(absPath)).size;
  if (DRY_RUN) {
    console.log(`  [dry] PUT ${key} (${(size / 1024).toFixed(1)} KB)`);
    return;
  }
  // R2 over home broadband sometimes throws EPROTO/EPIPE mid-stream.
  // Retry a few times with a fresh read stream each attempt.
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: createReadStream(absPath),
          ContentType: contentType,
          ContentLength: size,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      console.log(`  uploaded ${key} (${(size / 1024).toFixed(1)} KB)${attempt > 1 ? ` [retry ${attempt}]` : ''}`);
      return;
    } catch (e) {
      const transient = ['EPROTO', 'EPIPE', 'ECONNRESET', 'ETIMEDOUT'].includes(e?.code)
        || /decryption failed|bad record mac/i.test(e?.message || '');
      if (!transient || attempt === maxAttempts) throw e;
      const backoff = 500 * attempt;
      console.log(`  retry ${attempt}/${maxAttempts} after ${e.code || e.name} — sleeping ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

// Map a clip_src path like "/clips/duscu-01.mp4" to R2 key "clips/duscu-01.mp4"
// (strip leading slash). Same for thumb_src.
const keyFromPath = (p) => p.replace(/^\//, '');

// ---- Main --------------------------------------------------------------
async function main() {
  const clipsJsonPath = resolve(REPO_ROOT, 'site', 'src', 'data', 'clips.json');
  const clips = JSON.parse(await readFile(clipsJsonPath, 'utf8'));
  const filtered = onlySet ? clips.filter((c) => onlySet.has(c.id)) : clips;

  console.log(`[migrate] ${filtered.length} clip(s) to process${DRY_RUN ? ' (dry run)' : ''}`);

  const rows = [];
  for (const c of filtered) {
    console.log(`\n[${c.id}] ${c.exercise_name}`);

    const clipKey  = keyFromPath(c.clip_src);
    const thumbKey = keyFromPath(c.thumb_src);
    const clipAbs  = resolve(REPO_ROOT, 'site', 'public', clipKey);
    const thumbAbs = resolve(REPO_ROOT, 'site', 'public', thumbKey);

    // R2 uploads (skip if already there)
    if (!DRY_RUN && (await objectExists(clipKey))) {
      console.log(`  exists ${clipKey}`);
    } else {
      await uploadFile(clipAbs, clipKey, 'video/mp4');
    }
    if (!DRY_RUN && (await objectExists(thumbKey))) {
      console.log(`  exists ${thumbKey}`);
    } else {
      await uploadFile(thumbAbs, thumbKey, 'image/jpeg');
    }

    rows.push({
      id: c.id,
      exercise_name: c.exercise_name,
      category: c.category,
      muscle_group: c.muscle_group ?? null,
      equipment: c.equipment ?? [],
      form_cues: c.form_cues ?? [],
      rep_count: c.rep_count ?? null,
      clip_key: clipKey,
      thumb_key: thumbKey,
      source_url: c.source_url ?? null,
      exercise_name_confidence: c.exercise_name_confidence ?? null,
      boundary_confidence: c.boundary_confidence ?? null,
    });
  }

  if (DRY_RUN) {
    console.log(`\n[dry] would upsert ${rows.length} rows into workout.clips`);
    return;
  }

  console.log(`\n[db] upserting ${rows.length} rows into workout.clips`);
  await pgClient.connect();
  try {
    // One statement, parameterised, per row — simpler than building a multi-row VALUES.
    const UPSERT = `
      insert into workout.clips (
        id, exercise_name, category, muscle_group, equipment, form_cues, rep_count,
        clip_key, thumb_key, source_url, exercise_name_confidence, boundary_confidence
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict (id) do update set
        exercise_name = excluded.exercise_name,
        category = excluded.category,
        muscle_group = excluded.muscle_group,
        equipment = excluded.equipment,
        form_cues = excluded.form_cues,
        rep_count = excluded.rep_count,
        clip_key = excluded.clip_key,
        thumb_key = excluded.thumb_key,
        source_url = excluded.source_url,
        exercise_name_confidence = excluded.exercise_name_confidence,
        boundary_confidence = excluded.boundary_confidence
    `;
    for (const r of rows) {
      await pgClient.query(UPSERT, [
        r.id, r.exercise_name, r.category, r.muscle_group, r.equipment, r.form_cues,
        r.rep_count, r.clip_key, r.thumb_key, r.source_url,
        r.exercise_name_confidence, r.boundary_confidence,
      ]);
    }
    const { rows: countRows } = await pgClient.query('select count(*)::int as n from workout.clips');
    console.log(`[db] done — workout.clips row count = ${countRows[0].n}`);
  } finally {
    await pgClient.end();
  }
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
