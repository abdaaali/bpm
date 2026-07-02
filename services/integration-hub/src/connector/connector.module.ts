import { Module } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { ConnectorController } from './connector.controller';

@Module({
  providers: [ConnectorService],
  controllers: [ConnectorController],
  exports: [ConnectorService],
})
export class ConnectorModule {}
