import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  onModuleInit() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    this.pool.on('error', (err) => this.logger.error(`DB pool error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query(sql: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  async paginate(sql: string, params: any[], page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const countSql = `SELECT COUNT(*) FROM (${sql}) AS _count`;
    const dataSql = `${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countResult, dataResult] = await Promise.all([
      this.query(countSql, params),
      this.query(dataSql, [...params, pageSize, offset]),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pageSize),
    };
  }
}
