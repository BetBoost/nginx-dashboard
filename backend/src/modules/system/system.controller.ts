import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';

import { ServersService } from '@modules/servers/servers.service';
import { CURATED_PACKAGES, PackageService } from './package.service';
import { FirewallService } from './firewall.service';
import { RunRegistry } from './run-registry';
import { InstallPackageDto, ListPackagesDto, RemovePackageDto } from './dto/install-package.dto';
import { AddFirewallRuleDto } from './dto/firewall-rule.dto';

@ApiTags('system')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('servers/:id/system')
export class SystemController {
  constructor(
    private readonly servers: ServersService,
    private readonly packages: PackageService,
    private readonly firewall: FirewallService,
    private readonly runs: RunRegistry,
  ) {}

  // ── Packages ───────────────────────────────────────────────────────────

  @Get('packages/curated')
  curated() {
    return CURATED_PACKAGES;
  }

  @Get('packages')
  async list(@Param('id', ParseUUIDPipe) id: string, @Query() q: ListPackagesDto) {
    const server = await this.servers.findOrFail(id);
    return this.packages.list(server, q.q);
  }

  @Post('packages/check')
  async check(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { binaries: string[] },
  ) {
    const server = await this.servers.findOrFail(id);
    return this.packages.whichAvailable(server, body.binaries ?? []);
  }

  @Post('packages/install')
  async install(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstallPackageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    const runId = this.packages.install(server, dto.packages, user.id);
    return { runId };
  }

  @Post('packages/remove')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemovePackageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    const runId = this.packages.remove(server, dto.packages, dto.purge ?? false, user.id);
    return { runId };
  }

  @Post('packages/upgrade')
  async upgrade(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    const runId = this.packages.upgrade(server, user.id);
    return { runId };
  }

  // ── Firewall ───────────────────────────────────────────────────────────

  @Get('firewall')
  async firewallStatus(@Param('id', ParseUUIDPipe) id: string) {
    const server = await this.servers.findOrFail(id);
    return this.firewall.status(server);
  }

  @Post('firewall/enable')
  async firewallEnable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    const runId = this.firewall.enable(server, user.id);
    return { runId };
  }

  @Post('firewall/disable')
  async firewallDisable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    return this.firewall.disable(server, user.id);
  }

  @Post('firewall/rules')
  async addRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddFirewallRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    return this.firewall.addRule(server, dto, user.id);
  }

  @Delete('firewall/rules/:ruleId')
  async removeRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const server = await this.servers.findOrFail(id);
    return this.firewall.removeRule(server, ruleId, user.id);
  }

  // ── Runs ───────────────────────────────────────────────────────────────

  /** Replay buffered output for clients that connected late or want history. */
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    const r = this.runs.get(runId);
    if (!r) return { runId, finished: true, missing: true, chunks: [], result: null };
    return {
      runId,
      kind: r.kind,
      label: r.label,
      finished: r.finished,
      result: r.result ?? null,
      chunks: r.buffer,
    };
  }
}
