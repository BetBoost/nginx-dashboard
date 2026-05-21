import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { ServersModule } from '@modules/servers/servers.module';

@Module({
  imports: [ServersModule],
  providers: [BackupService],
  controllers: [BackupController],
  exports: [BackupService],
})
export class BackupModule {}
