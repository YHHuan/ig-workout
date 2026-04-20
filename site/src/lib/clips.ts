import clipsJson from '../data/clips.json';

export const CATEGORIES = ['core', 'legs', 'upper', 'full_body', 'mobility'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  core: 'Core',
  legs: 'Legs',
  upper: 'Upper',
  full_body: 'Full Body',
  mobility: 'Mobility',
};

// Raw shape stored in clips.json — keys, not URLs.
interface ClipRaw {
  id: string;
  exercise_name: string;
  category: Category;
  clip_key: string;          // e.g. "clips/duscu-01.mp4" — relative to PUBLIC_R2_BASE
  thumb_key: string;         // e.g. "thumbs/duscu-01.jpg"
  form_cues: string[];
  muscle_group?: string;
  equipment?: string[];
  rep_count?: number | null;
  exercise_name_confidence?: number;
  boundary_confidence?: number;
  source_url?: string;
}

// Runtime shape consumed by Astro components — URLs resolved against
// PUBLIC_R2_BASE. Swapping buckets / moving to a custom domain is one env var.
export interface Clip extends Omit<ClipRaw, 'clip_key' | 'thumb_key'> {
  clip_src: string;
  thumb_src: string;
}

// PUBLIC_R2_BASE is read from the build environment (Cloudflare Workers Build
// env vars or local .env). Falls back to the free r2.dev URL if unset so that
// local `npm run build` without .env still produces a runnable site.
const PUBLIC_R2_BASE = (import.meta.env.PUBLIC_R2_BASE
  ?? 'https://pub-b90466612445431fa3e66473fb8d2a9c.r2.dev').replace(/\/$/, '');

function hydrate(c: ClipRaw): Clip {
  const { clip_key, thumb_key, ...rest } = c;
  return {
    ...rest,
    clip_src:  `${PUBLIC_R2_BASE}/${clip_key}`,
    thumb_src: `${PUBLIC_R2_BASE}/${thumb_key}`,
  };
}

export async function getClips(): Promise<Clip[]> {
  return (clipsJson as ClipRaw[]).map(hydrate);
}
