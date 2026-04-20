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

export interface Clip {
  id: string;
  exercise_name: string;
  category: Category;         // coarse filter bucket
  clip_src: string;
  thumb_src: string;
  form_cues: string[];
  muscle_group?: string;      // specific label shown on card (e.g. "posterior chain")
  equipment?: string[];
  rep_count?: number | null;
  exercise_name_confidence?: number;
  boundary_confidence?: number;
  source_url?: string;
}

export async function getClips(): Promise<Clip[]> {
  // Phase 1: local JSON. Phase 2 swaps for Supabase build-time fetch.
  return clipsJson as Clip[];
}
