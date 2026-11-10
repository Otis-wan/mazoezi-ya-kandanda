import { AgeBand } from '../generated/prisma/enums.js';
import {
  AGE_BAND_CODES,
  ageBandToCode,
  CATEGORY_CODES,
  codeToAgeBand,
  codeToEnum,
} from './drill-codes.js';
import { buildWhere } from './drills.service.js';
import { ListDrillsQueryDto } from './drills.dto.js';

describe('drill codes', () => {
  it('turns age bands into library codes and back', () => {
    expect(ageBandToCode(AgeBand.AGE_13_14)).toBe('13-14');
    expect(AGE_BAND_CODES).toEqual(['13-14', '15-16', '17-19']);
    for (const code of AGE_BAND_CODES) {
      expect(ageBandToCode(codeToAgeBand(code))).toBe(code);
    }
  });

  it('lists categories the way the library file spells them', () => {
    expect(CATEGORY_CODES).toContain('ball_mastery');
    expect(CATEGORY_CODES).toContain('set_pieces');
    expect(codeToEnum('set_pieces')).toBe('SET_PIECES');
  });
});

describe('drill filters', () => {
  const query = (over: Partial<ListDrillsQueryDto>) =>
    Object.assign(new ListDrillsQueryDto(), over);

  it('adds no filter for an empty query', () => {
    expect(buildWhere(query({}))).toEqual({});
  });

  it('matches ALL drills when you filter by position', () => {
    expect(buildWhere(query({ position: 'GK' }))).toEqual({
      positions: { hasSome: ['GK', 'ALL'] },
    });
  });

  it('maps codes to enum names', () => {
    expect(
      buildWhere(
        query({
          category: 'ball_mastery',
          ageBand: '13-14',
          intensity: 'high',
        }),
      ),
    ).toEqual({
      category: 'BALL_MASTERY',
      intensity: 'HIGH',
      ageBands: { has: 'AGE_13_14' },
    });
  });
});
