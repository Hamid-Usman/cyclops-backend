import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { User } from '../auth/user.entity';
import { Client, ClientStatus } from './client.entity';
import { ClientService } from './client.service';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { passThroughDashboardCache } from '../cache/dashboard-cache.mock-spec';

const OWNER = 'owner-id';

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
  const cache = passThroughDashboardCache();

  beforeEach(async () => {
    jest.clearAllMocks();
    clients.create.mockImplementation((fields) => fields);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: getRepositoryToken(Client), useValue: clients },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: DashboardCache, useValue: cache },
      ],
    }).compile();
    service = module.get(ClientService);
  });

  describe('create', () => {
    it('adds a user as a client by email', async () => {
      users.findOne.mockResolvedValue(user);

      const result = await service.create(OWNER, {
        email: ' USER@example.com ',
      });

      expect(users.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(clients.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: OWNER,
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

      const result = await service.create(OWNER, {
        userId: user.id,
        status: ClientStatus.Lead,
      });

      expect(users.findOne).toHaveBeenCalledWith({ where: { id: user.id } });
      expect(result.status).toBe(ClientStatus.Lead);
    });

    it('rejects both email and userId', async () => {
      await expect(
        service.create(OWNER, { email: user.email, userId: user.id }),
      ).rejects.toThrow('Send either email or userId, not both');
    });

    it('throws when the user does not exist', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(
        service.create(OWNER, { email: 'x@example.com' }),
      ).rejects.toThrow('User not found');
    });

    it('throws a conflict when the owner already added this user', async () => {
      users.findOne.mockResolvedValue(user);
      clients.insert.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: 'ER_DUP_ENTRY' } as never),
      );
      await expect(service.create(OWNER, { userId: user.id })).rejects.toThrow(
        'You have already added this user as a client',
      );
    });

    it('refuses adding yourself as a client', async () => {
      users.findOne.mockResolvedValue({ ...user, id: OWNER });
      await expect(service.create(OWNER, { userId: OWNER })).rejects.toThrow(
        'You cannot add yourself as a client',
      );
      expect(clients.insert).not.toHaveBeenCalled();
    });
  });

  it('lists only the clients the owner added, with user info', async () => {
    clients.find.mockResolvedValue([
      {
        id: 'c1',
        status: ClientStatus.Active,
        user: { ...user, passwordHash: 'x' },
      },
    ]);
    await expect(service.findAll(OWNER)).resolves.toEqual([
      { id: 'c1', status: ClientStatus.Active, user },
    ]);
    expect(clients.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: OWNER } }),
    );
  });

  it("gets one of the owner's clients or throws not found", async () => {
    clients.findOne.mockResolvedValueOnce({
      id: 'c1',
      status: ClientStatus.Inactive,
      user,
    });
    await expect(service.findOne(OWNER, 'c1')).resolves.toEqual({
      id: 'c1',
      status: ClientStatus.Inactive,
      user,
    });
    expect(clients.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', ownerId: OWNER } }),
    );

    clients.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne(OWNER, 'missing')).rejects.toThrow(
      'Client not found',
    );
  });

  it('deletes a client, clears the caches that showed it, or throws not found', async () => {
    clients.findOne.mockResolvedValueOnce({ id: 'c1', userId: user.id });
    clients.delete.mockResolvedValueOnce({ affected: 1 });
    await expect(service.remove(OWNER, 'c1')).resolves.toBeUndefined();
    expect(clients.delete).toHaveBeenCalledWith({ id: 'c1', ownerId: OWNER });
    expect(cache.invalidate).toHaveBeenCalledWith(OWNER);
    expect(cache.invalidateClient).toHaveBeenCalledWith('c1');
    expect(cache.invalidateUser).toHaveBeenCalledWith(user.id);

    clients.findOne.mockResolvedValueOnce(null);
    clients.delete.mockClear();
    await expect(service.remove(OWNER, 'missing')).rejects.toThrow(
      'Client not found',
    );
    expect(clients.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting a client that has projects, proposals or invoices', async () => {
    clients.findOne.mockResolvedValueOnce({ id: 'c1', userId: user.id });
    clients.delete.mockRejectedValueOnce(
      new QueryFailedError('DELETE', [], {
        code: 'ER_ROW_IS_REFERENCED_2',
      } as never),
    );

    const removal = service.remove(OWNER, 'c1');
    await expect(removal).rejects.toBeInstanceOf(ConflictException);
    await expect(removal).rejects.toThrow(
      'This client has projects, proposals or invoices',
    );
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
      order: { createdAt: 'DESC' },
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
      service.update(OWNER, 'c1', { status: ClientStatus.Archived }),
    ).resolves.toEqual({ id: 'c1', status: ClientStatus.Archived, user });
    expect(clients.update).toHaveBeenCalledWith(
      { id: 'c1', ownerId: OWNER },
      { status: ClientStatus.Archived },
    );

    clients.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.update(OWNER, 'missing', { status: ClientStatus.Active }),
    ).rejects.toThrow('Client not found');
  });
});
