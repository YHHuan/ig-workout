#!/usr/bin/env node
// scripts/phase2/apply-schema.mjs
//
// Apply worker/sql/schema.sql via direct Postgres connection.
// Uses SUPABASE_DB_URL from .env. Idempotent (schema.sql uses `if not exists`).
//
// Usage:
//   node --env-file=../../.env apply-schema.mjs

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCHEMA_PATH = resolve(REPO_ROOT, 'worker', 'sql', 'schema.sql');

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('[fatal] SUPABASE_DB_URL not set');
  process.exit(1);
}

const sql = await readFile(SCHEMA_PATH, 'utf8');
console.log(`[schema] loaded ${SCHEMA_PATH} (${sql.length} chars)`);

const client = new pg.Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },  // Supabase requires SSL but serves self-managed certs
});

try {
  await client.connect();
  console.log('[schema] connected');
  await client.query(sql);
  console.log('[schema] applied');

  // Quick sanity: list tables in workout schema
  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'workout' order by table_name
  `);
  console.log('[schema] workout tables:', rows.map((r) => r.table_name).join(', '));
} catch (e) {
  console.error('[schema] error:', e.code || '', e.message);
  process.exit(1);
} finally {
  await client.end();
}
