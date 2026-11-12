import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { User } from '../auth/user.entity';
import { Client, ClientStatus } from './client.entity';
import { ClientService } from './client.service';
import { DashboardCache } from '../cache/dashboard-cache.service';

describe('ClientService', () => {
  let service: ClientService;
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    displayName: 'User Name',
  };
  const clients = {
    create: jest.fn(),
    insert: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  };
  const users = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    clients.create.mockImplementation((fields) => fields);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: getRepositoryToken(Client), useValue: clients },
        { provide: getRepositoryToken(User), useValue: users },
        {
          provide: DashboardCache,
          useValue: { invalidateClient: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ClientService);
  });

  describe('create', () => {
    it('adds a user as a client by email', async () => {
      users.findOne.mockResolvedValue(user);

      const result = await service.create({ email: ' USER@example.com ' });

      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(clients.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          status: ClientStatus.Active,
        }),
      );
      expect(result).toEqual({
        id: expect.any(String),
        status: ClientStatus.Active,
        user,
      });
    });

    it('adds a user as a client by id with a given status', async () => {
      users.findOne.mockResolvedValue(user);

      const result = await service.create({
        userId: user.id,
        status: ClientStatus.Lead,
      });

      expect(users.findOne).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(result.status).toBe(ClientStatus.Lead);
    });

    it('rejects both email and userId', async () => {
      await expect(
        service.create({ email: user.email, userId: user.id }),
      ).rejects.toThrow('Send either email or userId, not both');
    });

    it('throws when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.create({ email: 'x@example.com' })).rejects.toThrow(
        'User not found',
      );
    });

    it('throws a conflict when the user is already a client', async () => {
      users.findOne.mockResolvedValue(user);
      clients.insert.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: 'ER_DUP_ENTRY' } as never),
      );
      await expect(service.create({ userId: user.id })).rejects.toThrow(
        'This user is already a client',
      );
    });
  });

  it('lists clients with user info', async () => {
    clients.find.mockResolvedValue([
      {
        id: 'c1',
        status: ClientStatus.Active,
        user: { ...user, passwordHash: 'x' },
      },
    ]);
    await expect(service.findAll()).resolves.toEqual([
      { id: 'c1', status: ClientStatus.Active, user },
    ]);
  });

  it('gets one client or throws not found', async () => {
    clients.findOne.mockResolvedValueOnce({
      id: 'c1',
      status: ClientStatus.Inactive,
      user,
    });
    await expect(service.findOne('c1')).resolves.toEqual({
      id: 'c1',
      status: ClientStatus.Inactive,
      user,
    });

    clients.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(
      'Client not found',
    );
  });

  it('deletes a client or throws not found', async () => {
    clients.delete.mockResolvedValueOnce({ affected: 1 });
    await expect(service.remove('c1')).resolves.toBeUndefined();

    clients.delete.mockResolvedValueOnce({ affected: 0 });
    await expect(service.remove('missing')).rejects.toThrow('Client not found');
  });

  it("finds the current user's client record", async () => {
    clients.findOne.mockResolvedValueOnce({
      id: 'c1',
      status: ClientStatus.Active,
      user,
    });
    await expect(service.findForUser(user.id)).resolves.toEqual({
      id: 'c1',
      status: ClientStatus.Active,
      user,
    });
    expect(clients.findOne).toHaveBeenCalledWith({
      where: { userId: user.id },
      relations: { user: true },
    });

    clients.findOne.mockResolvedValueOnce(null);
    await expect(service.findForUser('nobody')).rejects.toThrow(
      'Client not found',
    );
  });

  it("changes a client's status or throws not found", async () => {
    clients.update.mockResolvedValueOnce({ affected: 1 });
    clients.findOne.mockResolvedValueOnce({
      id: 'c1',
      status: ClientStatus.Archived,
      user,
    });
    await expect(
      service.update('c1', { status: ClientStatus.Archived }),
    ).resolves.toEqual({ id: 'c1', status: ClientStatus.Archived, user });
    expect(clients.update).toHaveBeenCalledWith(
      { id: 'c1' },
      { status: ClientStatus.Archived },
    );

    clients.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.update('missing', { status: ClientStatus.Active }),
    ).rejects.toThrow('Client not found');
  });
});
