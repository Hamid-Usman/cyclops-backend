import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtSigner } from '@nestjs/authentication';
import { GoogleTokenVerifier } from './google-token.verifier';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';

describe('GoogleTokenVerifier', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'k1',
    alg: 'RS256',
    use: 'sig',
  };

  function sign(claims: Record<string, unknown>, audience = CLIENT_ID) {
    return new JwtSigner({
      key: privateKey,
      kid: 'k1',
      issuer: 'https://accounts.google.com',
      audience,
      ttl: '5m',
    }).sign(claims);
  }

  function verifier(clientId = CLIENT_ID) {
    return new GoogleTokenVerifier({
      get: () => clientId,
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the profile of a valid Google ID token', async () => {
    const token = sign({
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      name: 'Google User',
    });

    await expect(verifier().verify(token)).resolves.toEqual({
      subject: 'google-sub-1',
      email: 'user@example.com',
      emailVerified: true,
      name: 'Google User',
    });
  });

  it('rejects a token issued for another client', async () => {
    const token = sign({ sub: 'google-sub-1' }, 'someone-else');

    await expect(verifier().verify(token)).rejects.toThrow(
      'Invalid Google ID token',
    );
  });

  it('rejects a token signed by another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = new JwtSigner({
      key: other.privateKey,
      kid: 'k1',
      issuer: 'https://accounts.google.com',
      audience: CLIENT_ID,
    }).sign({ sub: 'google-sub-1' });

    await expect(verifier().verify(token)).rejects.toThrow(
      'Invalid Google ID token',
    );
  });

  it('rejects garbage', async () => {
    await expect(verifier().verify('not-a-jwt')).rejects.toThrow(
      'Invalid Google ID token',
    );
  });

  it('reports Google sign-in as unavailable without GOOGLE_CLIENT_ID', async () => {
    await expect(verifier('').verify(sign({ sub: 'x' }))).rejects.toThrow(
      'Google sign-in is not configured',
    );
  });
});
