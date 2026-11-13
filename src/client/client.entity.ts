import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';

export enum ClientStatus {
  Lead = 'lead',
  Active = 'active',
  Inactive = 'inactive',
  Archived = 'archived',
}

// A person (user) added as a client by an owner. Clients belong to the owner
// who added them; the same person can be a client of several owners.
@Entity('clients')
@Index('UQ_clients_owner_id_user_id', ['ownerId', 'userId'], { unique: true })
@Index('IDX_clients_user_id', ['userId'])
export class Client {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ name: 'owner_id', type: 'char', length: 36 })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'owner_id',
    foreignKeyConstraintName: 'FK_clients_owner_id',
  })
  owner: User;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_clients_user_id',
  })
  user: User;

  @Column({
    type: 'enum',
    enum: ClientStatus,
    default: ClientStatus.Active,
  })
  status: ClientStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
