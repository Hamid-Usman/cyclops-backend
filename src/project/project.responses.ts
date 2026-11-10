import { ApiProperty } from '@nestjs/swagger';
import { Project, ProjectStatus } from './project.entity';

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty({ example: 'Checkout redesign' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.Inactive })
  status: ProjectStatus;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  startDate: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2027-01-31' })
  dueDate: string | null;

  @ApiProperty({ type: Date, nullable: true })
  activatedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toProjectResponse(project: Project): ProjectResponseDto {
  return {
    id: project.id,
    clientId: project.clientId,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: project.startDate,
    dueDate: project.dueDate,
    activatedAt: project.activatedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
