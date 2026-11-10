import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from './user.entity';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: JwtService, useValue: jwtService },
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
});
