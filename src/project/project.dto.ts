import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  IsDateOnly,
  IsNotBlank,
  IsOptionalNotNull,
} from '../common/validation';
import { ProjectStatus } from './project.entity';

// There is no status field: new projects always start inactive.
export class CreateProjectDto {
  @ApiProperty({ example: '6b1f8e2c-3a4d-4f5e-9a1b-2c3d4e5f6a7b' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ example: 'Checkout redesign', maxLength: 200 })
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-12-01', nullable: true })
  @IsOptional()
  @IsDateOnly()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2027-01-31', nullable: true })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string | null;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptionalNotNull()
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-12-01', nullable: true })
  @IsOptional()
  @IsDateOnly()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2027-01-31', nullable: true })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string | null;

  @ApiPropertyOptional({
    enum: [ProjectStatus.Completed, ProjectStatus.Cancelled],
    description:
      'Complete or cancel the project. It becomes active only when the client accepts a proposal.',
  })
  @IsOptionalNotNull()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class UpdateMilestoneDto {
  @ApiProperty({
    example: true,
    description: 'Mark the milestone delivered, or undo that',
  })
  @IsBoolean()
  completed: boolean;
}
