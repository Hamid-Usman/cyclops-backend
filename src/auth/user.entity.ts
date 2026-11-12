import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Column,
} from 'typeorm';

@Entity('users')
@Index('UQ_users_email', ['email'], { unique: true })
@Index('UQ_users_google_subject', ['googleSubject'], { unique: true })
export class User {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 80 })
  displayName: string;

  /** Null for accounts created through Google sign-in. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 200,
    nullable: true,
    select: false,
  })
  passwordHash: string | null;

  /** Google's stable account id (`sub`), once Google sign-in is linked. */
  @Column({
    name: 'google_subject',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googleSubject: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
