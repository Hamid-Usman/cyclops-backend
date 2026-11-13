import { listCacheKey } from './list-cache-key';

describe('listCacheKey', () => {
  it('gives the same key whatever order the filters came in', () => {
    expect(listCacheKey('projects', { status: 'active', clientId: 'c1' })).toBe(
      listCacheKey('projects', { clientId: 'c1', status: 'active' }),
    );
  });

  it('leaves out filters that were not sent', () => {
    expect(listCacheKey('projects', { status: undefined, limit: 20 })).toBe(
      'projects?limit=20',
    );
    expect(listCacheKey('projects')).toBe('projects?');
  });

  it('gives different filters and pages different keys', () => {
    const keys = new Set([
      listCacheKey('invoices', {}),
      listCacheKey('invoices', { status: 'sent' }),
      listCacheKey('invoices', { limit: 20 }),
      listCacheKey('invoices', { limit: 20, offset: 20 }),
      listCacheKey('proposals', {}),
    ]);
    expect(keys.size).toBe(5);
  });
});
