import { Controller, Post, Body, Headers } from '@nestjs/common';
import { RoutingService, RoutingInput } from './routing.service';

// C3 — exposes the shared routing engine so other services (orchestrator task
// creation, contractor dispatch) resolve assignment through the same logic.
@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  private tenant(h: Record<string, string>) {
    return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
  }

  @Post('resolve')
  resolve(@Headers() h: Record<string, string>, @Body() body: RoutingInput) {
    return this.routing.resolve(this.tenant(h), body);
  }
}
