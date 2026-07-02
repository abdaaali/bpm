import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CaseService } from './case.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SlaCaseSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SlaCaseSchedulerService.name);

  constructor(private readonly caseSvc: CaseService, private readonly db: DatabaseService) {}

  onModuleInit() {
    setInterval(() => this.run().catch(e => this.logger.error(e.message)), 5 * 60 * 1000);
    setTimeout(() => this.run().catch(e => this.logger.error(e.message)), 30_000);
  }

  async run() {
    const tenants = await this.db.query(`SELECT id FROM tenants WHERE active=true`);
    let breaches = 0, atRisk = 0;
    for (const row of tenants.rows) {
      // Warn before breaching, then catch any that crossed the line.
      atRisk += await this.caseSvc.checkSlaAtRisk(row.id);
      breaches += await this.caseSvc.checkSlaBreaches(row.id);
    }
    if (breaches > 0 || atRisk > 0) this.logger.warn(`Case SLA scheduler: ${atRisk} at-risk, ${breaches} breach(es)`);
  }
}
