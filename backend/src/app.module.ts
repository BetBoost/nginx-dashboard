import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import appConfig from '@config/app.config';
import authConfig from '@config/auth.config';
import dbConfig from '@config/db.config';
import { validateEnv } from '@config/env.validation';

import { PrismaModule } from '@common/prisma/prisma.module';
import { CryptoModule } from '@common/crypto/crypto.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { ServersModule } from '@modules/servers/servers.module';
import { SubdomainsModule } from '@modules/subdomains/subdomains.module';
import { SshModule } from '@modules/ssh/ssh.module';
import { NginxModule } from '@modules/nginx/nginx.module';
import { SslModule } from '@modules/ssl/ssl.module';
import { MonitoringModule } from '@modules/monitoring/monitoring.module';
import { AuditModule } from '@modules/audit/audit.module';
import { BackupModule } from '@modules/backup/backup.module';
import { HealthModule } from '@modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, dbConfig],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
          limit: Number(process.env.THROTTLE_LIMIT ?? 100),
        },
      ],
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    CryptoModule,
    AuditModule,

    AuthModule,
    UsersModule,
    ServersModule,
    SshModule,
    NginxModule,
    SslModule,
    SubdomainsModule,
    MonitoringModule,
    BackupModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
