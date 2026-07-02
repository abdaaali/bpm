import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TaskService } from './task.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SlaSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SlaSchedulerService.name);
  private timer: NodeJS.Timeout;

  constructor(
    private readonly taskSvc: TaskService,
    private readonly db: DatabaseService,
  ) {}

  onModuleInit() {
    // Check every 5 minutes
    this.timer = setInterval(() => this.run().catch(e => this.logger.error(e.message)), 5 * 60 * 1000);
    // Initial check after 30s on startup
    setTimeout(() => this.run().catch(e => this.logger.error(e.message)), 30_000);
  }

  async run() {
    const tenantsResult = await this.db.query(`SELECT id FROM tenants WHERE active=true`);
    let total = 0;
    for (const row of tenantsResult.rows) {
      total += await this.taskSvc.checkSlaBreaches(row.id);
    }
    if (total > 0) this.logger.warn(`SLA scheduler: ${total} breach(es) detected`);
  }
}
