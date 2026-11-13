import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

// Optional paging for list endpoints. Without `limit` the whole list comes
// back, as before, so existing callers keep working.
export class PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: 'How many items to return. Leave out for all of them.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description: 'How many items to skip, for the next page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// TypeORM `take`/`skip` for a page. `skip` only applies with a `limit`.
export function toPage(query: PaginationQueryDto): {
  take?: number;
  skip?: number;
} {
  if (query.limit === undefined) {
    return {};
  }
  return { take: query.limit, skip: query.offset ?? 0 };
}
