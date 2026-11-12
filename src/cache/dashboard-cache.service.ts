import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Caches dashboard reads: an owner's dashboard numbers, and a client's portal
 * overview. Every key includes a per-owner (or per-client) version, and
 * `invalidate` / `invalidateClient` bump it, so a change shows up on the next
 * load instead of after the cache expires.
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

  /** Caches a read of what a client sees in their portal. */
  wrapForClient<T>(
    clientId: string,
    key: string,
    load: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    return this.wrapScoped('client-portal', clientId, key, load, ttlMs);
  }

  /** Call after any write that changes what the owner's dashboard shows. */
  invalidate(ownerId: string): Promise<void> {
    return this.bump('dashboard', ownerId);
  }

  /** Call after any write that changes what a client sees in their portal. */
  invalidateClient(clientId: string | null | undefined): Promise<void> {
    return clientId ? this.bump('client-portal', clientId) : Promise.resolve();
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

  private versionKey(scope: string, id: string): string {
    return `${scope}-version:${id}`;
  }
}
