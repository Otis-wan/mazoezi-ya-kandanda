import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto, toPage } from './pagination.js';

describe('pagination', () => {
  it('defaults to page 1 and 20 rows', () => {
    const q = plainToInstance(PaginationQueryDto, {});
    expect([q.page, q.limit, q.skip]).toEqual([1, 20, 0]);
  });

  it('reads numbers from query text', () => {
    const q = plainToInstance(PaginationQueryDto, { page: '3', limit: '10' });
    expect(q.skip).toBe(20);
  });

  it('rejects a limit over 100', async () => {
    const q = plainToInstance(PaginationQueryDto, { limit: '500' });
    expect(await validate(q)).not.toHaveLength(0);
  });

  it('counts pages', () => {
    const q = plainToInstance(PaginationQueryDto, { limit: '10' });
    expect(toPage([], 25, q).meta.totalPages).toBe(3);
  });
});