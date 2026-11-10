import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_ATTENTION_DAYS = 7;

export class AttentionQueryDto {
  @ApiPropertyOptional({
    example: DEFAULT_ATTENTION_DAYS,
    minimum: 0,
    maximum: 90,
    description: `Include items due within this many days. Overdue items are always included. Defaults to ${DEFAULT_ATTENTION_DAYS}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  days?: number;
}
