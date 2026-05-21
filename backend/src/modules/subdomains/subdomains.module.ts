import { Module } from '@nestjs/common';
import { SubdomainsService } from './subdomains.service';
import { SubdomainsController } from './subdomains.controller';
import { ServersModule } from '@modules/servers/servers.module';

@Module({
  imports: [ServersModule],
  providers: [SubdomainsService],
  controllers: [SubdomainsController],
  exports: [SubdomainsService],
})
export class SubdomainsModule {}
