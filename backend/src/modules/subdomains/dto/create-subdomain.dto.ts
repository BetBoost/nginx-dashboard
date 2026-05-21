import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateSubdomainDto {
  @ApiProperty({ example: 'app.example.com' })
  @IsString()
  @Matches(/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i, {
    message: 'name must be a valid FQDN',
  })
  name!: string;

  @ApiProperty()
  @IsUUID()
  serverId!: string;

  @ApiProperty({ example: '127.0.0.1' })
  @IsString()
  upstreamHost!: string;

  @ApiPropertyOptional({ default: 80 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  upstreamPort?: number;

  @ApiPropertyOptional({ enum: ['http', 'https'], default: 'http' })
  @IsOptional()
  @IsIn(['http', 'https'])
  upstreamScheme?: 'http' | 'https';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forceHttps?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  websocket?: boolean;

  @ApiPropertyOptional({ description: 'Raw nginx directives injected into the server block' })
  @IsOptional()
  @IsString()
  customDirectives?: string;

  @ApiPropertyOptional({ example: '100M' })
  @IsOptional()
  @IsString()
  clientMaxBodySize?: string;

  @ApiPropertyOptional({ description: 'Request a Let\'s Encrypt certificate after deploy', default: true })
  @IsOptional()
  @IsBoolean()
  issueSsl?: boolean;
}
