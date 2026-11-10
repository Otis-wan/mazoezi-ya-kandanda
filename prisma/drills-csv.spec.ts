import { readFileSync } from 'node:fs';
import { toCsv } from './drills-csv.js';
import { CSV_PATH, readLibrary } from './library.js';

describe('drill library CSV', () => {
  it('matches the library file (run "npm run drills:csv" if this fails)', () => {
    expect(readFileSync(CSV_PATH, 'utf8')).toBe(toCsv(readLibrary()));
  });
});
