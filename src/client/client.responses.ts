import { ApiProperty } from '@nestjs/swagger';
import { PublicUserResponseDto } from '../auth/auth.responses';
import { ClientStatus } from './client.entity';

export class ClientResponseDto {
  @ApiProperty({ example: '6b1f8e2c-3a4d-4f5e-9a1b-2c3d4e5f6a7b' })
  id: string;

  @ApiProperty({ enum: ClientStatus, example: ClientStatus.Active })
  status: ClientStatus;

  @ApiProperty({ type: PublicUserResponseDto })
  user: PublicUserResponseDto;
}
