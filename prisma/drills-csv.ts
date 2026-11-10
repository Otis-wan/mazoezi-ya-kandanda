/**
 * Turns the drill library file into a CSV a coach can open in Excel or Sheets.
 * The JSON file is the source of truth. The CSV is made from it, never edited
 * by hand. Run `npm run drills:csv` after you change the library.
 */

import type { Library, LibraryDrill } from './library.js';

const COLUMNS: { header: string; value: (d: LibraryDrill) => string }[] = [
  { header: 'id', value: (d) => d.id },
  { header: 'name', value: (d) => d.name },
  { header: 'category', value: (d) => d.category },
  { header: 'subcategory', value: (d) => d.subcategory },
  { header: 'format', value: (d) => d.format },
  { header: 'age_bands', value: (d) => d.age_bands.join('; ') },
  { header: 'positions', value: (d) => d.positions.join('; ') },
  { header: 'duration_min', value: (d) => String(d.duration_min) },
  { header: 'intensity', value: (d) => d.intensity },
  { header: 'equipment', value: (d) => d.equipment.join('; ') },
  { header: 'description', value: (d) => d.description },
  {
    header: 'coaching_points',
    value: (d) => d.coaching_points.map((p) => `- ${p}`).join('\n'),
  },
  {
    header: 'rubric (1 emerging, 3 consistent, 5 excellent)',
    value: (d) =>
      d.rubric.map((r) => `${r.criterion}: ${r.description}`).join('\n'),
  },
  { header: 'progression', value: (d) => d.progression ?? '' },
  { header: 'video_note', value: (d) => d.video_note ?? '' },
  { header: 'safety_note', value: (d) => d.safety_note ?? '' },
];

function cell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per drill. A leading BOM makes Excel read the file as UTF-8. */
export function toCsv(library: Library): string {
  const rows = [
    COLUMNS.map((c) => cell(c.header)).join(','),
    ...library.drills.map((d) => COLUMNS.map((c) => cell(c.value(d))).join(',')),
  ];
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}
