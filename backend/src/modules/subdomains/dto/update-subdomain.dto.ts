import { PartialType } from '@nestjs/swagger';
import { CreateSubdomainDto } from './create-subdomain.dto';

export class UpdateSubdomainDto extends PartialType(CreateSubdomainDto) {}
