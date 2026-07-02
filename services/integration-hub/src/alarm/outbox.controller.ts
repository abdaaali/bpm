import { Controller, Post } from '@nestjs/common';
import { CaseSyncOutboxService } from './case-sync-outbox.service';

// C5 — manual flush/reconcile trigger for the alarm⇄case outbox (ops + tests).
// The worker also runs these on a timer.
@Controller('alarms')
export class OutboxController {
  constructor(private readonly outbox: CaseSyncOutboxService) {}

  @Post('outbox/run')
  async run() {
    const reconciled = await this.outbox.reconcile();
    const processed = await this.outbox.processPending(100);
    return { reconciled, processed };
  }
}
