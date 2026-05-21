import { Global, Module } from '@nestjs/common';
import { NginxService } from './nginx.service';
import { NginxTemplateService } from './nginx-template.service';

@Global()
@Module({
  providers: [NginxService, NginxTemplateService],
  exports: [NginxService, NginxTemplateService],
})
export class NginxModule {}
