import { ProjectMilestone } from './project-milestone.entity';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Client } from '../client/client.entity';
import { Project, ProjectStatus } from './project.entity';
import { ProjectService } from './project.service';

const OWNER_ID = 'owner-id';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-id',
    ownerId: OWNER_ID,
    clientId: 'client-id',
    name: 'Checkout redesign',
    description: null,
    status: ProjectStatus.Inactive,
    startDate: null,
    dueDate: null,
    activatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Project;
}

describe('ProjectService', () => {
  const milestones = {
    find: jest.fn(),
    update: jest.fn(),
    findOneOrFail: jest.fn(),
  };
  let service: ProjectService;
  const projects = { findOne: jest.fn(), find: jest.fn(), insert: jest.fn() };
  const clients = { findOne: jest.fn() };
  const manager = { findOne: jest.fn(), update: jest.fn() };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(Client), useValue: clients },
        {
          provide: getRepositoryToken(ProjectMilestone),
          useValue: milestones,
        },
        { provide: DataSource, useValue: dataSource },
        {
          provide: DashboardCache,
          useValue: { invalidate: jest.fn(), invalidateClient: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ProjectService);
    projects.findOne.mockResolvedValue(makeProject());
  });

  describe('create', () => {
    it('always creates the project as inactive', async () => {
      clients.findOne.mockResolvedValue({ id: 'client-id', userId: 'other' });

      await service.create(OWNER_ID, {
        clientId: 'client-id',
        name: '  Checkout redesign ',
      });

      expect(projects.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: OWNER_ID,
          clientId: 'client-id',
          name: 'Checkout redesign',
          status: ProjectStatus.Inactive,
          activatedAt: null,
        }),
      );
    });

    it('rejects an unknown client', async () => {
      clients.findOne.mockResolvedValue(null);

      await expect(
        service.create(OWNER_ID, { clientId: 'missing', name: 'Project' }),
      ).rejects.toThrow('Client not found');
      expect(projects.insert).not.toHaveBeenCalled();
    });

    it('rejects making yourself the client', async () => {
      clients.findOne.mockResolvedValue({ id: 'client-id', userId: OWNER_ID });

      await expect(
        service.create(OWNER_ID, { clientId: 'client-id', name: 'Project' }),
      ).rejects.toThrow('You cannot be the client on your own project');
    });

    it('rejects a due date before the start date', async () => {
      clients.findOne.mockResolvedValue({ id: 'client-id', userId: 'other' });

      await expect(
        service.create(OWNER_ID, {
          clientId: 'client-id',
          name: 'Project',
          startDate: '2026-12-10',
          dueDate: '2026-12-01',
        }),
      ).rejects.toThrow('The due date cannot be before the start date');
    });
  });

  describe('update', () => {
    it('refuses to activate a project directly', async () => {
      manager.findOne.mockResolvedValue(makeProject());

      await expect(
        service.update(OWNER_ID, 'project-id', {
          status: ProjectStatus.Active,
        }),
      ).rejects.toThrow(
        'A project becomes active only when the client accepts a proposal',
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('cancels an inactive project', async () => {
      manager.findOne.mockResolvedValue(makeProject());

      await service.update(OWNER_ID, 'project-id', {
        status: ProjectStatus.Cancelled,
      });

      expect(manager.update).toHaveBeenCalledWith(
        Project,
        { id: 'project-id' },
        { status: ProjectStatus.Cancelled },
      );
    });

    it('checks dates against the values already saved', async () => {
      manager.findOne.mockResolvedValue(
        makeProject({ startDate: '2026-12-10' }),
      );

      await expect(
        service.update(OWNER_ID, 'project-id', { dueDate: '2026-12-01' }),
      ).rejects.toThrow('The due date cannot be before the start date');
    });

    it("hides other users' projects", async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.update(OWNER_ID, 'project-id', { name: 'New name' }),
      ).rejects.toThrow('Project not found');
      expect(manager.findOne).toHaveBeenCalledWith(
        Project,
        expect.objectContaining({
          where: { id: 'project-id', ownerId: OWNER_ID },
        }),
      );
    });
  });
});
