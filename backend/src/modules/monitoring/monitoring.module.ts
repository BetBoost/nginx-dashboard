import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { ServersModule } from '@modules/servers/servers.module';

@Module({
  imports: [ServersModule],
  providers: [MonitoringService],
  controllers: [MonitoringController],
  exports: [MonitoringService],
})
export class MonitoringModule {}
