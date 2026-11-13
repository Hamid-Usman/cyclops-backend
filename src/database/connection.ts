// MySQL pool settings for the app's database connection.
//
// The database is reached over TLS, so opening a connection costs several
// round trips. Keeping a few idle connections open (with TCP keep-alive, so
// the network doesn't silently drop them) lets requests reuse them instead.
export function mysqlPoolOptions(env: NodeJS.ProcessEnv = process.env) {
  const poolSize = Number(env.DB_POOL_SIZE ?? 10);
  return {
    // Must stay below the connection limit of the database plan.
    connectionLimit: poolSize,
    maxIdle: poolSize,
    idleTimeout: 5 * 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  };
}
