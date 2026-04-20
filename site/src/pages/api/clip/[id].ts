// PATCH /api/clip/:id  — update one clip from the phone.
//
// Auth: Bearer token, compared against EDIT_TOKEN env var. Any unauthenticated
// request gets 401. The token is set once per device via the URL hash
// `#auth=<token>` (see ClipModal.astro); after that it lives in localStorage.
//
// Whitelisted fields: exercise_name, category, muscle_group, form_cues,
// equipment, exercise_name_confidence. Anything else in the body is ignored.

import type { APIRoute } from 'astro';
import { getSupabaseAdmin, envFromLocals } from '../../../lib/db';
import { CATEGORIES } from '../../../lib/clips';

export const prerender = false;

const EDITABLE_FIELDS = [
  'exercise_name',
  'category',
  'muscle_group',
  'form_cues',
  'equipment',
  'exercise_name_confidence',
] as const;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = envFromLocals(locals);

  // --- auth -------------------------------------------------------------
  const expected = env.EDIT_TOKEN;
  if (!expected) {
    return jsonResponse(500, { error: 'EDIT_TOKEN not configured on server' });
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (provided !== expected) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  // --- input ------------------------------------------------------------
  const id = params.id;
  if (!id || typeof id !== 'string') {
    return jsonResponse(400, { error: 'missing id' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { error: 'invalid json body' });
  }

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];

    switch (key) {
      case 'exercise_name':
      case 'muscle_group':
        if (v === null || typeof v === 'string') {
          // Treat "" as null for muscle_group, keep as "" for name (schema
          // tolerates empty string — frontend just shows blank).
          patch[key] = typeof v === 'string' && v.trim() === '' && key === 'muscle_group'
            ? null
            : (v ?? null);
        }
        break;
      case 'category':
        if (typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)) {
          patch[key] = v;
        }
        break;
      case 'form_cues':
      case 'equipment':
        if (Array.isArray(v)) {
          patch[key] = v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
        break;
      case 'exercise_name_confidence':
        if (typeof v === 'number' && v >= 0 && v <= 1) {
          patch[key] = v;
        }
        break;
    }
  }

  if (Object.keys(patch).length === 0) {
    return jsonResponse(400, { error: 'no valid fields in body' });
  }

  // --- write ------------------------------------------------------------
  let supabase;
  try {
    supabase = getSupabaseAdmin(env);
  } catch (e) {
    return jsonResponse(500, { error: (e as Error).message });
  }

  const { data, error } = await supabase
    .from('clips')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return jsonResponse(500, { error: error.message, details: error });
  }

  return jsonResponse(200, { ok: true, clip: data });
};
