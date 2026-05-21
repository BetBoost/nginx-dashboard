import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SubdomainStatus } from '@prisma/client';

import { PaginationDto } from '@common/utils/pagination';

export class ListSubdomainsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  serverId?: string;

  @ApiPropertyOptional({ enum: SubdomainStatus })
  @IsOptional()
  @IsEnum(SubdomainStatus)
  status?: SubdomainStatus;
}
