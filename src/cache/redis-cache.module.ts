import { createKeyv } from '@keyv/redis';
import { CacheModule, type CacheOptions } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DashboardCache } from './dashboard-cache.service';

// Makes the cache (CACHE_MANAGER) available app-wide, stored in Redis at
// REDIS_URL. Without REDIS_URL it falls back to an in-memory cache.
// DashboardCache is available app-wide too.
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheOptions => {
        const logger = new Logger('RedisCache');
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          logger.warn('REDIS_URL is not set. Using an in-memory cache.');
          return {};
        }

        // disableOfflineQueue: while disconnected, cache calls fail at once
        // instead of waiting for Redis to come back.
        const redis = createKeyv(
          { url, disableOfflineQueue: true },
          {
            namespace: 'cyclops',
            // Start and keep running while Redis is down. Reads then miss and
            // requests go to the database.
            throwOnConnectError: false,
            connectionTimeout: 2000,
          },
        );

        // Without a listener, a dropped connection crashes the app.
        redis.on('error', (error: Error) =>
          logger.warn(`Redis error: ${error.message}`),
        );

        return { stores: [redis] };
      },
    }),
  ],
  providers: [DashboardCache],
  exports: [DashboardCache],
})
export class RedisCacheModule {}
