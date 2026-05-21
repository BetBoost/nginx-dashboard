import { Global, Module } from '@nestjs/common';
import { SslService } from './ssl.service';

@Global()
@Module({
  providers: [SslService],
  exports: [SslService],
})
export class SslModule {}
