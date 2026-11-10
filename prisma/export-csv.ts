// Writes prisma/data/football_drill_library.csv from the library JSON.
//   npm run drills:csv
import { writeFileSync } from 'node:fs';
import { toCsv } from './drills-csv.js';
import { CSV_PATH, readLibrary } from './library.js';

const library = readLibrary();
writeFileSync(CSV_PATH, toCsv(library));
console.log(`Wrote ${library.drills.length} drills to ${CSV_PATH}`);
