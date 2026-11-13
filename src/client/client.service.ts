import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DeleteResult, QueryFailedError, Repository } from 'typeorm';
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

  async create(
    ownerId: string,
    input: CreateClientDto,
  ): Promise<ClientResponseDto> {
    const user = await this.findUser(input);
    if (user.id === ownerId) {
      throw new BadRequestException('You cannot add yourself as a client');
    }

    const client = this.clients.create({
      id: randomUUID(),
      ownerId,
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
        throw new ConflictException(
          'You have already added this user as a client',
        );
      }
      throw error;
    }

    return toClientResponse(client, user);
  }

  async findAll(ownerId: string): Promise<ClientResponseDto[]> {
    const clients = await this.clients.find({
      where: { ownerId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return clients.map((client) => toClientResponse(client, client.user));
  }

  async findOne(ownerId: string, id: string): Promise<ClientResponseDto> {
    const client = await this.clients.findOne({
      where: { id, ownerId },
      relations: { user: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return toClientResponse(client, client.user);
  }

  /**
   * The signed-in user's client record, to tell whether they are anyone's
   * client. Someone who is a client of several owners gets the most recently
   * added record.
   */
  async findForUser(userId: string): Promise<ClientResponseDto> {
    const client = await this.clients.findOne({
      where: { userId },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return toClientResponse(client, client.user);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    const result = await this.clients.update(
      { id, ownerId },
      { status: input.status },
    );
    if (!result.affected) {
      throw new NotFoundException('Client not found');
    }
    await this.dashboardCache.invalidateClient(id);
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    let result: DeleteResult;
    try {
      result = await this.clients.delete({ id, ownerId });
    } catch (error) {
      // Projects, proposals and invoices all reference the client, and are
      // records worth keeping, so the delete is refused rather than cascaded.
      if (
        error instanceof QueryFailedError &&
        error.driverError.code === 'ER_ROW_IS_REFERENCED_2'
      ) {
        throw new ConflictException(
          'This client has projects, proposals or invoices, so it cannot be deleted. Archive it instead.',
        );
      }
      throw error;
    }
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
