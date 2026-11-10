import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../client/client.entity';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './project.dto';
import { Project, ProjectStatus } from './project.entity';
import { ProjectResponseDto, toProjectResponse } from './project.responses';
import { assertOwnerProjectTransition } from './project.rules';

function assertDateOrder(
  startDate: string | null,
  dueDate: string | null,
): void {
  // YYYY-MM-DD strings sort the same way as the dates they stand for.
  if (startDate && dueDate && dueDate < startDate) {
    throw new BadRequestException(
      'The due date cannot be before the start date',
    );
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    ownerId: string,
    input: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const client = await this.clients.findOne({
      where: { id: input.clientId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    if (client.userId === ownerId) {
      throw new BadRequestException(
        'You cannot be the client on your own project',
      );
    }

    const startDate = input.startDate ?? null;
    const dueDate = input.dueDate ?? null;
    assertDateOrder(startDate, dueDate);

    const id = randomUUID();
    await this.projects.insert({
      id,
      ownerId,
      clientId: client.id,
      name: input.name.trim(),
      description: trimOrNull(input.description),
      status: ProjectStatus.Inactive,
      startDate,
      dueDate,
      activatedAt: null,
    });

    return this.findOne(ownerId, id);
  }

  async findAll(
    ownerId: string,
    query: ListProjectsQueryDto,
  ): Promise<ProjectResponseDto[]> {
    const projects = await this.projects.find({
      where: {
        ownerId,
        ...(query.status !== undefined && { status: query.status }),
        ...(query.clientId !== undefined && { clientId: query.clientId }),
      },
      order: { createdAt: 'DESC' },
    });
    return projects.map(toProjectResponse);
  }

  async findOne(ownerId: string, id: string): Promise<ProjectResponseDto> {
    const project = await this.projects.findOne({ where: { id, ownerId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return toProjectResponse(project);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      // Locked so a status change can't race with a client accepting a
      // proposal for this project.
      const project = await manager.findOne(Project, {
        where: { id, ownerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const changes: Partial<Project> = {};
      if (input.name !== undefined) {
        changes.name = input.name.trim();
      }
      if (input.description !== undefined) {
        changes.description = trimOrNull(input.description);
      }
      if (input.startDate !== undefined) {
        changes.startDate = input.startDate;
      }
      if (input.dueDate !== undefined) {
        changes.dueDate = input.dueDate;
      }
      if (input.status !== undefined && input.status !== project.status) {
        assertOwnerProjectTransition(project.status, input.status);
        changes.status = input.status;
      }

      assertDateOrder(
        changes.startDate !== undefined ? changes.startDate : project.startDate,
        changes.dueDate !== undefined ? changes.dueDate : project.dueDate,
      );

      if (Object.keys(changes).length > 0) {
        await manager.update(Project, { id }, changes);
      }
    });

    return this.findOne(ownerId, id);
  }
}
