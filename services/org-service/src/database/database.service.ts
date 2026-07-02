import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    this.pool.on('error', (err) => this.logger.error('PG pool error', err));
  }

  async onModuleInit() {
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Database connected');
    } catch (err) {
      this.logger.error(`DB connection failed: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /** Run fn inside a single transaction; commits on success, rolls back on throw. */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Pagination helper
  paginate(page: number, pageSize: number) {
    const p = Math.max(1, page);
    const ps = Math.min(100, Math.max(1, pageSize));
    return { limit: ps, offset: (p - 1) * ps };
  }
}
