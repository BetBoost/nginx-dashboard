import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ServersModule } from '@modules/servers/servers.module';
import { AuditModule } from '@modules/audit/audit.module';

import { PackageService } from './package.service';
import { FirewallService } from './firewall.service';
import { RunRegistry } from './run-registry';
import { SystemController } from './system.controller';
import { SystemGateway } from './system.gateway';

@Module({
  imports: [
    ServersModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwt.accessSecret'),
      }),
    }),
  ],
  controllers: [SystemController],
  providers: [PackageService, FirewallService, RunRegistry, SystemGateway],
  exports: [PackageService, FirewallService],
})
export class SystemModule {}
