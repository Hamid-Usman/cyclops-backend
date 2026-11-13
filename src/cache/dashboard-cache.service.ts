import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Caches reads at three scopes:
 * - per owner: dashboard numbers and the owner's lists (`wrap`);
 * - per client record: what a person sees in their portal (`wrapForClients`);
 * - per user: who they are and which client records they have (`wrapForUser`).
 *
 * Every key includes a version for its scope, and `invalidate`,
 * `invalidateClient` and `invalidateUser` bump it, so a change shows up on
 * the next load instead of after the cache expires.
 */
@Injectable()
export class DashboardCache {
  private readonly logger = new Logger(DashboardCache.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  wrap<T>(
    ownerId: string,
    key: string,
    load: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    return this.wrapScoped('dashboard', ownerId, key, load, ttlMs);
  }

  /**
   * Caches a read of what a person sees in their portal, across all their
   * client records (one per owner). Invalidating any of them clears it.
   */
  async wrapForClients<T>(
    clientIds: string[],
    key: string,
    load: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const ids = [...clientIds].sort();
    const versions = await this.versions('client-portal', ids);
    return this.cache.wrap(
      `client-portal:${ids.join(',')}:v${versions.join('.')}:${key}`,
      load,
      ttlMs,
    );
  }

  /** Caches a read about one signed-in user, such as their client records. */
  wrapForUser<T>(
    userId: string,
    key: string,
    load: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    return this.wrapScoped('user', userId, key, load, ttlMs);
  }

  /**
   * Call after any write that changes what the owner's dashboard or lists
   * show.
   */
  invalidate(ownerId: string): Promise<void> {
    return this.bump('dashboard', ownerId);
  }

  /** Call after any write that changes what a client sees in their portal. */
  invalidateClient(clientId: string | null | undefined): Promise<void> {
    return clientId ? this.bump('client-portal', clientId) : Promise.resolve();
  }

  /** Call after any write that changes which client records a user has. */
  invalidateUser(userId: string | null | undefined): Promise<void> {
    return userId ? this.bump('user', userId) : Promise.resolve();
  }

  private async wrapScoped<T>(
    scope: string,
    id: string,
    key: string,
    load: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const version = await this.version(scope, id);
    return this.cache.wrap(`${scope}:${id}:v${version}:${key}`, load, ttlMs);
  }

  private async bump(scope: string, id: string): Promise<void> {
    try {
      await this.cache.set(this.versionKey(scope, id), Date.now());
    } catch (error) {
      // The write itself succeeded; the cached read is at most one TTL behind.
      this.logger.warn(
        `Could not invalidate the ${scope} cache: ${(error as Error).message}`,
      );
    }
  }

  private async version(scope: string, id: string): Promise<number> {
    try {
      return (await this.cache.get<number>(this.versionKey(scope, id))) ?? 0;
    } catch {
      return 0;
    }
  }

  // All versions in one cache call, instead of one round trip per id.
  private async versions(scope: string, ids: string[]): Promise<number[]> {
    if (ids.length === 0) {
      return [];
    }
    try {
      const values = await this.cache.mget<number>(
        ids.map((id) => this.versionKey(scope, id)),
      );
      return ids.map((_id, index) => values[index] ?? 0);
    } catch {
      return ids.map(() => 0);
    }
  }

  private versionKey(scope: string, id: string): string {
    return `${scope}-version:${id}`;
  }
}
