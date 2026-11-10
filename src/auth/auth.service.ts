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
import { LoginDto, RegisterDto } from './auth.dto';
import { PublicUser } from './auth.types';
import { User } from './user.entity';

const TOKEN_EXPIRY_SECONDS = 60 * 60;
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
      if (
        error instanceof QueryFailedError &&
        error.driverError.code === 'ER_DUP_ENTRY' &&
        error.driverError.message.includes('UQ_users_email')
      ) {
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

  async findPublicUser(id: string): Promise<PublicUser> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
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
