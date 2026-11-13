// Named *-spec.ts so the production build leaves it out (tsconfig.build.json)
// while Jest, which only runs *.spec.ts, does not mistake it for a test.
// A DashboardCache stand-in for unit tests: every read loads straight from
// the source, and every method is a jest mock so tests can check calls.
export function passThroughDashboardCache() {
  const load = (...args: unknown[]) => (args[2] as () => unknown)();
  return {
    wrap: jest.fn(load),
    wrapForClients: jest.fn(load),
    wrapForUser: jest.fn(load),
    invalidate: jest.fn(),
    invalidateClient: jest.fn(),
    invalidateUser: jest.fn(),
  };
}
