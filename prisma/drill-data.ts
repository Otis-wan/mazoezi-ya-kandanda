import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AgeBand,
  DrillCategory,
  DrillFormat,
  DrillPosition,
  Intensity,
} from '../src/generated/prisma/enums.js';
import type { Prisma } from '../src/generated/prisma/client.js';

type RawRubricItem = { criterion: string; description: string };

interface RawDrill {
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
  rubric: RawRubricItem[];
  progression?: string;
  video_note?: string;
  safety_note?: string;
}

export interface DrillRecord {
  id: string;
  data: Omit<Prisma.DrillUncheckedCreateInput, 'id'>;
}

const DEFAULT_PATH = fileURLToPath(
  new URL('./data/football_drill_library.json', import.meta.url),
);

export function toEnum<T extends Record<string, string>>(
  enumObject: T,
  value: string,
  label: string,
): T[keyof T] {
  const found = Object.values(enumObject).find((v) => v === value);
  if (found === undefined) {
    throw new Error(`Unknown ${label}: "${value}"`);
  }
  return found as T[keyof T];
}

function mapDrill(raw: RawDrill): DrillRecord {
  const where = `drill ${raw.id}`;

  if (!/^[a-z]{2}-\d{3}$/.test(raw.id)) {
    throw new Error(`Bad id format: "${raw.id}"`);
  }
  if (raw.age_bands.length === 0) throw new Error(`${where}: no age bands`);
  if (raw.positions.length === 0) throw new Error(`${where}: no positions`);
  if (raw.duration_min <= 0) throw new Error(`${where}: bad duration`);
  if (raw.rubric.length === 0) throw new Error(`${where}: empty rubric`);

  const criteria = raw.rubric.map((r) => r.criterion);
  if (new Set(criteria).size !== criteria.length) {
    throw new Error(`${where}: repeated rubric criterion`);
  }

  return {
    id: raw.id,
    data: {
      name: raw.name,
      category: toEnum(DrillCategory, raw.category.toUpperCase(), `${where} category`),
      subcategory: raw.subcategory,
      format: toEnum(DrillFormat, raw.format.toUpperCase(), `${where} format`),
      ageBands: raw.age_bands.map((band) =>
        toEnum(AgeBand, `AGE_${band.replace('-', '_')}`, `${where} age band`),
      ),
      positions: raw.positions.map((p) =>
        toEnum(DrillPosition, p.toUpperCase(), `${where} position`),
      ),
      durationMin: raw.duration_min,
      intensity: toEnum(Intensity, raw.intensity.toUpperCase(), `${where} intensity`),
      equipment: raw.equipment,
      description: raw.description,
      coachingPoints: raw.coaching_points,
      rubric: raw.rubric,
      progression: raw.progression ?? null,
      videoNote: raw.video_note ?? null,
      safetyNote: raw.safety_note ?? null,
    },
  };
}

export function loadDrills(path: string = DEFAULT_PATH): DrillRecord[] {
  const file = JSON.parse(readFileSync(path, 'utf8')) as { drills: RawDrill[] };
  const drills = file.drills.map(mapDrill);

  const ids = drills.map((d) => d.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Repeated drill id in the library');
  }
  return drills;
}