import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ClientStatus } from './client.entity';

// Identify the user to add as a client by email or by id (one is required).
export class CreateClientDto {
  @ApiPropertyOptional({ example: 'user@example.com', maxLength: 320 })
  @ValidateIf((dto: CreateClientDto) => dto.userId === undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: '0d7b6d2a-8d75-4a14-9e3f-40c61a2264fa' })
  @ValidateIf((dto: CreateClientDto) => dto.email === undefined)
  @IsUUID()
  userId?: string;

  // @ApiPropertyOptional({ enum: ClientStatus, default: ClientStatus.Active })
  // @IsOptional()
  // @IsEnum(ClientStatus)
  // status?: ClientStatus;
}
