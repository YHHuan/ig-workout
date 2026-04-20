import clipsJson from '../data/clips.json';

export interface Clip {
  id: string;
  exercise_name: string;
  clip_src: string;      // Phase 1: "/clips/squat.mp4"; Phase 2: R2 URL
  thumb_src: string;     // Phase 1: "/thumbs/squat.jpg"; Phase 2: R2 URL
  form_cues: string[];
  muscle_group?: string;
  equipment?: string[];
  rep_count?: number | null;
  exercise_name_confidence?: number;
  boundary_confidence?: number;
  source_url?: string;
}

export async function getClips(): Promise<Clip[]> {
  // Phase 1: pull from local JSON.
  // Phase 2 will replace this with a Supabase build-time fetch.
  return clipsJson as Clip[];
}
