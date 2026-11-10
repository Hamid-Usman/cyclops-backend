import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
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

@Entity('clients')
@Index('UQ_clients_user_id', ['userId'], { unique: true })
export class Client {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
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
