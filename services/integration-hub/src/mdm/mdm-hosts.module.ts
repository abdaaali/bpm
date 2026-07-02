import { Module } from '@nestjs/common';
import { MdmHostsController } from './mdm-hosts.controller';
import { MdmHostsService } from './mdm-hosts.service';
import { MdmLookupsController } from './mdm-lookups.controller';
import { MdmLookupsService } from './mdm-lookups.service';

@Module({
  controllers: [MdmHostsController, MdmLookupsController],
  providers: [MdmHostsService, MdmLookupsService],
  exports: [MdmHostsService, MdmLookupsService],
})
export class MdmHostsModule {}
