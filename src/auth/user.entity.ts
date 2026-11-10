import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Column,
} from 'typeorm';

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
export class User {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 80 })
  displayName: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 200,
    select: false,
  })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
