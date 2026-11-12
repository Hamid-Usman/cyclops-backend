import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { GoogleTokenVerifier } from './google-token.verifier';

describe('AuthService', () => {
  let authService: AuthService;
  const users = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
  };
  const googleTokens = {
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: JwtService, useValue: jwtService },
        { provide: GoogleTokenVerifier, useValue: googleTokens },
      ],
    }).compile();
    authService = module.get(AuthService);
    users.create.mockImplementation((fields) => fields);
    users.save.mockImplementation(async (user) => user);
  });

  it('registers an account with a password hash and returns a bearer token', async () => {
    users.findOne.mockResolvedValue(null);

    const result = await authService.register({
      email: '  USER@example.com ',
      password: 'strong-password',
      displayName: '  User Name ',
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        displayName: 'User Name',
        passwordHash: expect.not.stringContaining('strong-password'),
      }),
    );
    expect(result).toEqual({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: expect.objectContaining({
        email: 'user@example.com',
        displayName: 'User Name',
      }),
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('logs in with a correct password', async () => {
    users.findOne.mockResolvedValue(null);
    const registered = await authService.register({
      email: 'user@example.com',
      password: 'strong-password',
      displayName: 'User Name',
    });
    const savedUser = users.save.mock.calls[0][0];
    users.findOne.mockResolvedValue(savedUser);

    const result = await authService.login({
      email: 'USER@example.com',
      password: 'strong-password',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(registered.user.id).toBe(savedUser.id);
  });

  it('rejects an incorrect password', async () => {
    users.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      displayName: 'User Name',
      passwordHash: '00'.repeat(16) + ':' + '00'.repeat(64),
    });

    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow('Invalid email or password');
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  describe('Google sign-in', () => {
    const profile = {
      subject: 'google-sub-1',
      email: 'User@Example.com',
      emailVerified: true,
      name: 'Google User',
    };

    it('signs in a user already linked to the Google account', async () => {
      googleTokens.verify.mockResolvedValue(profile);
      users.findOne.mockResolvedValueOnce({
        id: 'user-id',
        email: 'user@example.com',
        displayName: 'User Name',
      });

      const result = await authService.signInWithGoogle('id-token');

      expect(users.findOne).toHaveBeenCalledWith({
        where: { googleSubject: 'google-sub-1' },
      });
      expect(result.user.id).toBe('user-id');
      expect(users.save).not.toHaveBeenCalled();
    });

    it('creates an account without a password on first sign-in', async () => {
      googleTokens.verify.mockResolvedValue(profile);
      users.findOne.mockResolvedValue(null);

      const result = await authService.signInWithGoogle('id-token');

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          displayName: 'Google User',
          passwordHash: null,
          googleSubject: 'google-sub-1',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'signed-token' }),
      );
      expect(result.user).not.toHaveProperty('googleSubject');
    });

    it('refuses to take over a password account with the same email', async () => {
      googleTokens.verify.mockResolvedValue(profile);
      users.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'other', email: 'user@example.com' });

      await expect(authService.signInWithGoogle('id-token')).rejects.toThrow(
        'An account with this email already exists',
      );
      expect(users.save).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('refuses a Google account without a verified email', async () => {
      googleTokens.verify.mockResolvedValue({
        ...profile,
        emailVerified: false,
      });
      users.findOne.mockResolvedValue(null);

      await expect(authService.signInWithGoogle('id-token')).rejects.toThrow(
        'no verified email',
      );
      expect(users.save).not.toHaveBeenCalled();
    });

    it('links Google to the signed-in user', async () => {
      googleTokens.verify.mockResolvedValue(profile);
      const user = {
        id: 'user-id',
        email: 'user@example.com',
        displayName: 'User Name',
        googleSubject: null,
      };
      users.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

      const result = await authService.linkGoogle('user-id', 'id-token');

      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ googleSubject: 'google-sub-1' }),
      );
      expect(result).toEqual({
        id: 'user-id',
        email: 'user@example.com',
        displayName: 'User Name',
      });
    });

    it('refuses to link a Google account that belongs to another user', async () => {
      googleTokens.verify.mockResolvedValue(profile);
      users.findOne
        .mockResolvedValueOnce({ id: 'user-id', googleSubject: null })
        .mockResolvedValueOnce({ id: 'other-user' });

      await expect(
        authService.linkGoogle('user-id', 'id-token'),
      ).rejects.toThrow('already linked to another account');
      expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects password login for an account created through Google', async () => {
      users.findOne.mockResolvedValue({
        id: 'user-id',
        email: 'user@example.com',
        displayName: 'User Name',
        passwordHash: null,
      });

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'any-password',
        }),
      ).rejects.toThrow('Invalid email or password');
    });
  });
});
