import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupSwagger } from './../src/swagger';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        // Optional settings (REDIS_URL, GOOGLE_CLIENT_ID) are left unset.
        get: () => undefined,
        getOrThrow: (key: string) => {
          if (key === 'DATABASE_URL') {
            return 'mysql://user:password@localhost:3306/test';
          }
          if (key === 'JWT_SECRET') {
            return 'test-secret-that-is-at-least-thirty-two-characters';
          }
          throw new Error(`Unexpected configuration key: ${key}`);
        },
      })
      .overrideProvider(getDataSourceToken())
      .useValue({
        options: { type: 'mysql' },
        entityMetadatas: [],
        manager: {},
        getRepository: jest.fn().mockReturnValue({}),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('serves generated Swagger documentation', () => {
    return request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200)
      .expect(({ body }) => {
        expect(body.info.title).toBe('Cyclops Backend API');
        expect(body.paths['/auth/register'].post).toBeDefined();
        expect(body.paths['/auth/me'].get.security).toEqual([
          { 'access-token': [] },
        ]);
        expect(body.paths['/auth/google'].post).toBeDefined();
        expect(body.paths['/client/me'].get).toBeDefined();
        expect(
          body.paths['/received-proposals/{id}/accept'].post,
        ).toBeDefined();
      });
  });

  afterEach(async () => {
    await app?.close();
  });
});
