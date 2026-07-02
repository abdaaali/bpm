import { Controller, Get } from '@nestjs/common';

@Controller('api/ext/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'external-api', timestamp: new Date().toISOString() };
  }
}
