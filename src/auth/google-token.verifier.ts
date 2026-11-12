import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient, JwtError, JwtVerifier } from '@nestjs/authentication';

const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
// Google signs ID tokens with either form of its issuer.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleProfile {
  /** Google's stable account id. Accounts are linked by this, never by email. */
  subject: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifies Google ID tokens (from Google Identity Services on the web, or the
 * Google Sign-In SDKs on mobile): signature against Google's published keys,
 * issuer, audience (our client ids) and expiry.
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly verifiers?: Map<string, JwtVerifier>;

  constructor(config: ConfigService) {
    const clientIds = (config.get<string>('GOOGLE_CLIENT_ID') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (clientIds.length === 0) {
      return;
    }

    const jwks = new JwksClient(GOOGLE_JWKS_URI);
    this.verifiers = new Map(
      GOOGLE_ISSUERS.map((issuer) => [
        issuer,
        new JwtVerifier({
          jwks,
          issuer,
          audience: clientIds,
          clockTolerance: '30s',
          required: ['exp', 'sub'],
        }),
      ]),
    );
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    if (!this.verifiers) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    // The issuer only picks which verifier runs; that verifier checks it again.
    const verifier = this.verifiers.get(readIssuer(idToken) ?? '');
    if (!verifier) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    let claims: Awaited<ReturnType<JwtVerifier['verify']>>;
    try {
      claims = await verifier.verify(idToken);
    } catch (error) {
      if (error instanceof JwtError) {
        throw new UnauthorizedException('Invalid Google ID token');
      }
      throw error;
    }

    return {
      subject: claims.sub as string,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      emailVerified:
        claims.email_verified === true || claims.email_verified === 'true',
      name: typeof claims.name === 'string' ? claims.name : undefined,
    };
  }
}

function readIssuer(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    const iss = (claims as { iss?: unknown } | null)?.iss;
    return typeof iss === 'string' ? iss : undefined;
  } catch {
    return undefined;
  }
}
