import { Module } from '@nestjs/common';
import { MdmController } from './mdm.controller';
import { MdmLookupsGatewayController } from './mdm-lookups.controller';

@Module({ controllers: [MdmController, MdmLookupsGatewayController] })
export class MdmModule {}
