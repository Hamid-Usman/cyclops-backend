import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { CreateClientDto, UpdateClientDto } from './client.dto';
import { Client, ClientStatus } from './client.entity';
import { ClientResponseDto } from './client.responses';

function toClientResponse(client: Client, user: User): ClientResponseDto {
  return {
    id: client.id,
    status: client.status,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  };
}

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dashboardCache: DashboardCache,
  ) {}

  async create(input: CreateClientDto): Promise<ClientResponseDto> {
    const user = await this.findUser(input);

    const client = this.clients.create({
      id: randomUUID(),
      userId: user.id,
      status: input.status ?? ClientStatus.Active,
    });

    try {
      await this.clients.insert(client);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.driverError.code === 'ER_DUP_ENTRY'
      ) {
        throw new ConflictException('This user is already a client');
      }
      throw error;
    }

    return toClientResponse(client, user);
  }

  async findAll(): Promise<ClientResponseDto[]> {
    const clients = await this.clients.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return clients.map((client) => toClientResponse(client, client.user));
  }

  async findOne(id: string): Promise<ClientResponseDto> {
    const client = await this.clients.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return toClientResponse(client, client.user);
  }

  async findForUser(userId: string): Promise<ClientResponseDto> {
    const client = await this.clients.findOne({
      where: { userId },
      relations: { user: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return toClientResponse(client, client.user);
  }

  async update(id: string, input: UpdateClientDto): Promise<ClientResponseDto> {
    const result = await this.clients.update({ id }, { status: input.status });
    if (!result.affected) {
      throw new NotFoundException('Client not found');
    }
    await this.dashboardCache.invalidateClient(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.clients.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('Client not found');
    }
  }

  private async findUser(input: CreateClientDto): Promise<User> {
    if (input.email !== undefined && input.userId !== undefined) {
      throw new BadRequestException('Send either email or userId, not both');
    }
    const user = await this.users.findOne({
      where:
        input.userId !== undefined
          ? { id: input.userId }
          : { email: input.email!.trim().toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
