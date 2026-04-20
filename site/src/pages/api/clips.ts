// GET /api/clips — returns all clips as the DB sees them.
//
// The homepage is statically prerendered from clips.json at build time; this
// endpoint is what the client fetches on mount to overlay any edits that have
// happened since the last deploy. Public, no auth (same visibility as the
// rendered HTML).

import type { APIRoute } from 'astro';
import { getSupabaseAdmin, envFromLocals } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = envFromLocals(locals);

  let supabase;
  try {
    supabase = getSupabaseAdmin(env);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { data, error } = await supabase
    .from('clips')
    .select('id, exercise_name, category, muscle_group, equipment, form_cues, exercise_name_confidence');

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Short edge cache — good enough so rapid refreshes don't hammer Supabase,
  // short enough that edits appear within ~30s on other devices / tabs. The
  // device that made the edit patches its own DOM immediately so it doesn't
  // wait for cache expiry.
  return new Response(JSON.stringify({ clips: data ?? [] }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=0, s-maxage=30',
    },
  });
};
