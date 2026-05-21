import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ServersService } from '@modules/servers/servers.service';
import { NginxService } from '@modules/nginx/nginx.service';

@ApiTags('monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly servers: ServersService,
    private readonly nginx: NginxService,
  ) {}

  @Get('overview')
  overview() {
    return this.monitoring.overview();
  }

  @Get('servers/:id/status')
  async serverStatus(@Param('id', ParseUUIDPipe) id: string) {
    const server = await this.servers.findOrFail(id);
    return this.nginx.status(server);
  }

  @Get('subdomains/:id/probe')
  probe(@Param('id', ParseUUIDPipe) id: string) {
    return this.monitoring.probeSubdomain(id);
  }
}
