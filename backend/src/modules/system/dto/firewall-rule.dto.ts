import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class AddFirewallRuleDto {
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsEnum(['tcp', 'udp'] as const)
  protocol!: 'tcp' | 'udp';

  @IsEnum(['allow', 'deny'] as const)
  action!: 'allow' | 'deny';

  @IsOptional()
  @Matches(/^[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?$/, { message: 'source must be IPv4 or CIDR' })
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  comment?: string;
}
