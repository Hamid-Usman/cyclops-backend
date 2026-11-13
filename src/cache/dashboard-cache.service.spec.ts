import { DashboardCache } from './dashboard-cache.service';

// A tiny in-memory stand-in for the cache-manager API.
function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    mget: jest.fn(async (keys: string[]) => keys.map((key) => store.get(key))),
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

    // A person who is a client of two owners: records a and b.
    const read = () =>
      dashboard.wrapForClients(['b', 'a'], 'overview', load, 1000);

    await read();
    // Same id, other scope, or someone else's record: none clear it.
    await dashboard.invalidate('a');
    await dashboard.invalidateClient('other-client');
    expect(await read()).toBe('first');

    // A change to either of their records does.
    await dashboard.invalidateClient('b');
    expect(await read()).toBe('second');
  });

  it("caches a user's reads until their client records change", async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    const load = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const read = () => dashboard.wrapForUser('user', 'client-ids', load, 1000);

    expect(await read()).toBe('first');
    // Owner and client-record changes are other scopes.
    await dashboard.invalidate('user');
    await dashboard.invalidateClient('user');
    expect(await read()).toBe('first');

    await dashboard.invalidateUser('user');
    expect(await read()).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores a missing user id', async () => {
    const cache = makeCache();
    const dashboard = new DashboardCache(cache as never);
    await dashboard.invalidateUser(undefined);
    expect(cache.set).not.toHaveBeenCalled();
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
