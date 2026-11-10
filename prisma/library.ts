import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type RubricItem = {
  criterion: string;
  description: string;
};

/** One drill as written in the library file. */
export interface LibraryDrill {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  format: string;
  age_bands: string[];
  positions: string[];
  duration_min: number;
  intensity: string;
  equipment: string[];
  description: string;
  coaching_points: string[];
  rubric: RubricItem[];
  progression?: string;
  video_note?: string;
  safety_note?: string;
}

export interface Library {
  drills: LibraryDrill[];
}

/** The library file is the source of truth. The CSV is made from it. */
const LIBRARY_PATH = fileURLToPath(
  new URL('./data/football_drill_library.json', import.meta.url),
);
export const CSV_PATH = LIBRARY_PATH.replace(/\.json$/, '.csv');

/** A rubric text must hold all three levels: "1 = ...; 3 = ...; 5 = ...". */
export const RUBRIC_LEVELS = /^1 = (.+?); 3 = (.+?); 5 = (.+)$/;

export function readLibrary(path: string = LIBRARY_PATH): Library {
  return JSON.parse(readFileSync(path, 'utf8')) as Library;
}
