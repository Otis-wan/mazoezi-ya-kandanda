import {
  AgeBand,
  DrillCategory,
  DrillFormat,
  DrillPosition,
  Intensity,
} from '../generated/prisma/enums.js';

/**
 * The API speaks the same words as the drill library file
 * ("ball_mastery", "13-14"). The database uses enum names. This file
 * converts between the two, so no other file has to.
 */

/** A drill ID: two letters and three digits, such as "sh-008". */
export const DRILL_ID = /^[a-z]{2}-\d{3}$/;

export const CATEGORY_CODES = Object.values(DrillCategory).map((v) =>
  v.toLowerCase(),
);
export const FORMAT_CODES = Object.values(DrillFormat).map((v) =>
  v.toLowerCase(),
);
export const INTENSITY_CODES = Object.values(Intensity).map((v) =>
  v.toLowerCase(),
);
export const POSITION_CODES = Object.values(DrillPosition);
export const AGE_BAND_CODES = Object.values(AgeBand).map(ageBandToCode);

export function ageBandToCode(band: AgeBand): string {
  return band.replace('AGE_', '').replace('_', '-');
}

export function codeToAgeBand(code: string): AgeBand {
  return `AGE_${code.replace('-', '_')}` as AgeBand;
}

export function codeToEnum<T extends string>(code: string): T {
  return code.toUpperCase() as T;
}

export interface DrillSummaryRow {
  id: string;
  name: string;
  category: DrillCategory;
  subcategory: string;
  format: DrillFormat;
  ageBands: AgeBand[];
  positions: DrillPosition[];
  durationMin: number;
  intensity: Intensity;
  equipment: string[];
}

export interface DrillRow extends DrillSummaryRow {
  description: string;
  coachingPoints: string[];
  rubric: unknown;
  progression: string | null;
  videoNote: string | null;
  safetyNote: string | null;
  sampleVideoUrl?: string | null;
}

/** Fields the list view and routine view need. */
export const DRILL_SUMMARY_SELECT = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  format: true,
  ageBands: true,
  positions: true,
  durationMin: true,
  intensity: true,
  equipment: true,
} as const;

export function toDrillSummary(d: DrillSummaryRow) {
  return {
    id: d.id,
    name: d.name,
    category: d.category.toLowerCase(),
    subcategory: d.subcategory,
    format: d.format.toLowerCase(),
    ageBands: d.ageBands.map(ageBandToCode),
    positions: d.positions,
    durationMin: d.durationMin,
    intensity: d.intensity.toLowerCase(),
    equipment: d.equipment,
  };
}

export function toDrillDetail(d: DrillRow) {
  return {
    ...toDrillSummary(d),
    description: d.description,
    coachingPoints: d.coachingPoints,
    rubric: d.rubric,
    progression: d.progression,
    videoNote: d.videoNote,
    safetyNote: d.safetyNote,
    sampleVideoUrl: d.sampleVideoUrl ?? null,
  };
}
