import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Client } from '../client/client.entity';

export enum ProjectStatus {
  Inactive = 'inactive',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

@Entity('projects')
@Index('IDX_projects_owner_id_status', ['ownerId', 'status'])
@Index('IDX_projects_client_id', ['clientId'])
export class Project {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // The user who created the project.
  @Column({ name: 'owner_id', type: 'char', length: 36 })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({
    name: 'owner_id',
    foreignKeyConstraintName: 'FK_projects_owner_id',
  })
  owner: User;

  @Column({ name: 'client_id', type: 'char', length: 36 })
  clientId: string;

  @ManyToOne(() => Client)
  @JoinColumn({
    name: 'client_id',
    foreignKeyConstraintName: 'FK_projects_client_id',
  })
  client: Client;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Copied from the accepted proposal.
  @Column({ type: 'text', nullable: true })
  deliverables: string | null;

  // Stays inactive until the client accepts a proposal for this project.
  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.Inactive,
  })
  status: ProjectStatus;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'activated_at', type: 'datetime', nullable: true })
  activatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
