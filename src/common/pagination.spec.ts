import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto, toPage } from './pagination';

async function errorsFor(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  return (await validate(dto)).map((error) => error.property);
}

describe('pagination', () => {
  it('returns the whole list when no limit is given', () => {
    expect(toPage({})).toEqual({});
    expect(toPage({ offset: 10 })).toEqual({});
  });

  it('pages with limit and offset', () => {
    expect(toPage({ limit: 20 })).toEqual({ take: 20, skip: 0 });
    expect(toPage({ limit: 20, offset: 40 })).toEqual({ take: 20, skip: 40 });
  });

  it('accepts query-string numbers', async () => {
    expect(await errorsFor({ limit: '25', offset: '50' })).toEqual([]);
  });

  it('rejects out-of-range or non-integer values', async () => {
    expect(await errorsFor({ limit: '0' })).toEqual(['limit']);
    expect(await errorsFor({ limit: '101' })).toEqual(['limit']);
    expect(await errorsFor({ limit: '2.5' })).toEqual(['limit']);
    expect(await errorsFor({ offset: '-1' })).toEqual(['offset']);
  });
});
