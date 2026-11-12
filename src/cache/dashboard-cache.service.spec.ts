import { DashboardCache } from './dashboard-cache.service';

// A tiny in-memory stand-in for the cache-manager API.
function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    wrap: jest.fn(async (key: string, load: () => Promise<unknown>) => {
      if (!store.has(key)) store.set(key, await load());
      return store.get(key);
    }),
  };
}

describe('DashboardCache', () => {
  it('serves cached numbers until the owner changes something', async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    const load = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    expect(await dashboard.wrap('owner', 'summary', load, 1000)).toBe('first');
    expect(await dashboard.wrap('owner', 'summary', load, 1000)).toBe('first');
    expect(load).toHaveBeenCalledTimes(1);

    await dashboard.invalidate('owner');
    expect(await dashboard.wrap('owner', 'summary', load, 1000)).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not clear other owners' numbers", async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    const load = jest.fn().mockResolvedValue('value');

    await dashboard.wrap('owner-a', 'summary', load, 1000);
    await dashboard.invalidate('owner-b');
    await dashboard.wrap('owner-a', 'summary', load, 1000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps client portal reads separate from owner dashboards', async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    const load = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await dashboard.wrapForClient('id', 'overview', load, 1000);
    // Same id, other scope: neither clears the client's cache.
    await dashboard.invalidate('id');
    await dashboard.invalidateClient('other-client');
    expect(await dashboard.wrapForClient('id', 'overview', load, 1000)).toBe(
      'first',
    );

    await dashboard.invalidateClient('id');
    expect(await dashboard.wrapForClient('id', 'overview', load, 1000)).toBe(
      'second',
    );
  });

  it('ignores a missing client id', async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    await dashboard.invalidateClient(null);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not fail the write when the cache is down', async () => {
    const cache = makeCache();
    cache.set.mockRejectedValue(new Error('Redis is down'));
    const dashboard = new DashboardCache(cache as never);
    await expect(dashboard.invalidate('owner')).resolves.toBeUndefined();
  });
});
