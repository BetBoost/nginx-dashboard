import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateServerDto {
  @ApiProperty({ example: 'edge-eu-01' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiProperty({ example: 'edge1.example.com' })
  @IsString()
  @Matches(/^[a-zA-Z0-9.\-]+$/, { message: 'host must be hostname or IPv4/IPv6' })
  host!: string;

  @ApiPropertyOptional({ default: 22 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ example: 'deploy' })
  @IsString()
  username!: string;

  @ApiPropertyOptional({
    description:
      'Plain SSH private key (will be encrypted at rest). Either privateKey or password must be provided.',
  })
  @IsOptional()
  @IsString()
  privateKey?: string;

  @ApiPropertyOptional({ description: 'Optional passphrase for the private key' })
  @IsOptional()
  @IsString()
  passphrase?: string;

  @ApiPropertyOptional({
    description:
      'Plain SSH password (will be encrypted at rest). Alternative to privateKey.',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ default: '/etc/nginx' })
  @IsOptional()
  @IsString()
  nginxPath?: string;

  @ApiPropertyOptional({ default: '/etc/nginx/sites-available' })
  @IsOptional()
  @IsString()
  sitesAvailable?: string;

  @ApiPropertyOptional({ default: '/etc/nginx/sites-enabled' })
  @IsOptional()
  @IsString()
  sitesEnabled?: string;

  @ApiPropertyOptional({ default: 'sudo systemctl reload nginx' })
  @IsOptional()
  @IsString()
  reloadCommand?: string;

  @ApiPropertyOptional({ default: 'sudo nginx -t' })
  @IsOptional()
  @IsString()
  testCommand?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  certbotEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
