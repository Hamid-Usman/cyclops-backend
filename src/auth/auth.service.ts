import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { Repository, QueryFailedError } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { PublicUser } from './auth.types';
import { GoogleTokenVerifier } from './google-token.verifier';
import { User } from './user.entity';

const TOKEN_EXPIRY_SECONDS = 60 * 60;

// The public profile (id, email, display name) never changes once created,
// so `GET /auth/me` can be cached for a long time.
const PROFILE_CACHE_TTL_MS = 60 * 60_000;
const DUMMY_PASSWORD_HASH = `${'00'.repeat(16)}:${'00'.repeat(64)}`;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

function isDuplicateKey(error: unknown, constraint: string): boolean {
  return (
    error instanceof QueryFailedError &&
    error.driverError.code === 'ER_DUP_ENTRY' &&
    String(error.driverError.message).includes(constraint)
  );
}

function googleDisplayName(name: string | undefined, email: string): string {
  const displayName = (name?.trim() || email.split('@')[0]).slice(0, 80);
  return displayName || 'Google user';
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly googleTokens: GoogleTokenVerifier,
    private readonly cache: DashboardCache,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = this.users.create({
      id: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash: await this.hashPassword(input.password),
    });

    try {
      await this.users.save(user);
    } catch (error) {
      if (isDuplicateKey(error, 'UQ_users_email')) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    return this.createAuthResponse(user);
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findOne({
      where: { email },
      select: { id: true, email: true, displayName: true, passwordHash: true },
    });
    const passwordMatches = await this.verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  /**
   * Signs in with a Google ID token, creating the account on first sign-in.
   * An existing password account is never taken over by email: its owner
   * signs in with the password and links Google from there (`linkGoogle`),
   * since nothing proves they own the address they registered with.
   */
  async signInWithGoogle(idToken: string) {
    const profile = await this.googleTokens.verify(idToken);

    const linked = await this.users.findOne({
      where: { googleSubject: profile.subject },
    });
    if (linked) {
      return this.createAuthResponse(linked);
    }

    if (!profile.email || !profile.emailVerified) {
      throw new UnauthorizedException(
        'Your Google account has no verified email address',
      );
    }
    const email = profile.email.trim().toLowerCase();
    if (await this.users.findOne({ where: { email } })) {
      throw new ConflictException(
        'An account with this email already exists. Log in with your password, then link your Google account.',
      );
    }

    const user = this.users.create({
      id: randomUUID(),
      email,
      displayName: googleDisplayName(profile.name, email),
      passwordHash: null,
      googleSubject: profile.subject,
    });

    try {
      await this.users.save(user);
    } catch (error) {
      // A concurrent first sign-in with the same Google account won the race.
      if (isDuplicateKey(error, 'UQ_users_google_subject')) {
        const winner = await this.users.findOne({
          where: { googleSubject: profile.subject },
        });
        if (winner) {
          return this.createAuthResponse(winner);
        }
      }
      if (isDuplicateKey(error, 'UQ_users_email')) {
        throw new ConflictException(
          'An account with this email already exists. Log in with your password, then link your Google account.',
        );
      }
      throw error;
    }

    return this.createAuthResponse(user);
  }

  /** Links a Google account to the signed-in user, so they can sign in with either. */
  async linkGoogle(userId: string, idToken: string): Promise<PublicUser> {
    const profile = await this.googleTokens.verify(idToken);

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.googleSubject === profile.subject) {
      return toPublicUser(user);
    }
    if (user.googleSubject) {
      throw new ConflictException(
        'This account is already linked to a different Google account',
      );
    }

    const owner = await this.users.findOne({
      where: { googleSubject: profile.subject },
    });
    if (owner) {
      throw new ConflictException(
        'This Google account is already linked to another account',
      );
    }

    user.googleSubject = profile.subject;
    try {
      await this.users.save(user);
    } catch (error) {
      if (isDuplicateKey(error, 'UQ_users_google_subject')) {
        throw new ConflictException(
          'This Google account is already linked to another account',
        );
      }
      throw error;
    }
    return toPublicUser(user);
  }

  findPublicUser(id: string): Promise<PublicUser> {
    // A missing user throws, and errors are never cached.
    return this.cache.wrapForUser(
      id,
      'profile',
      async () => {
        const user = await this.users.findOne({ where: { id } });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        return toPublicUser(user);
      },
      PROFILE_CACHE_TTL_MS,
    );
  }

  private async createAuthResponse(user: User) {
    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: TOKEN_EXPIRY_SECONDS,
      user: toPublicUser(user),
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await deriveKey(password, salt);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  private async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    const [saltHex, hashHex] = storedHash.split(':');
    if (
      !saltHex ||
      !hashHex ||
      !/^[\da-f]{32}$/i.test(saltHex) ||
      !/^[\da-f]{128}$/i.test(hashHex)
    ) {
      return false;
    }

    const expectedHash = Buffer.from(hashHex, 'hex');
    const actualHash = await deriveKey(password, Buffer.from(saltHex, 'hex'));
    return timingSafeEqual(actualHash, expectedHash);
  }
}
