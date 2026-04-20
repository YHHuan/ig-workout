// Supabase admin client for server-only code (API routes).
//
// Service role key has full DB access — NEVER import this from client code.
// The `schema: 'workout'` binding means PostgREST talks to the workout schema
// directly; enable it once via Supabase dashboard → Settings → API →
// "Exposed schemas" (add `workout`).

import { createClient } from '@supabase/supabase-js';

export type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  EDIT_TOKEN?: string;
};

export function getSupabaseAdmin(env: Env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the Worker env',
    );
  }
  return createClient(url, key, {
    db: { schema: 'workout' },
    auth: { persistSession: false },
  });
}

// Pull CF Workers runtime env (via `Astro.locals.runtime.env`) with a fallback
// to import.meta.env so local `astro dev` with --env-file also works.
export function envFromLocals(locals: unknown): Env {
  const runtime = (locals as { runtime?: { env?: Env } } | null)?.runtime;
  const cfEnv = runtime?.env ?? {};
  return {
    SUPABASE_URL: cfEnv.SUPABASE_URL ?? import.meta.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      cfEnv.SUPABASE_SERVICE_ROLE_KEY ?? import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    EDIT_TOKEN: cfEnv.EDIT_TOKEN ?? import.meta.env.EDIT_TOKEN,
  };
}
