import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MdmLookupsService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS mdm_lookups (
        id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        type         VARCHAR(64)  NOT NULL,
        value        VARCHAR(255) NOT NULL,
        sort_order   INTEGER      NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (type, value)
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_mdm_lookups_type ON mdm_lookups (type)
    `);
  }

  async listAll(): Promise<Record<string, any[]>> {
    const r = await this.db.query(
      `SELECT * FROM mdm_lookups ORDER BY type, sort_order, value`,
    );
    const grouped: Record<string, any[]> = {};
    for (const row of r.rows) {
      if (!grouped[row.type]) grouped[row.type] = [];
      grouped[row.type].push(row);
    }
    return grouped;
  }

  async listByType(type: string): Promise<any[]> {
    const r = await this.db.query(
      `SELECT * FROM mdm_lookups WHERE type=$1 ORDER BY sort_order, value`,
      [type],
    );
    return r.rows;
  }

  async getValuesForType(type: string): Promise<string[]> {
    const r = await this.db.query(
      `SELECT value FROM mdm_lookups WHERE type=$1 ORDER BY sort_order, value`,
      [type],
    );
    return r.rows.map((row: any) => row.value);
  }

  async add(type: string, value: string): Promise<any> {
    const r = await this.db.query(
      `INSERT INTO mdm_lookups (type, value)
       VALUES ($1, $2)
       ON CONFLICT (type, value) DO NOTHING
       RETURNING *`,
      [type, value.trim()],
    );
    return r.rows[0] || null;
  }

  async remove(id: string): Promise<void> {
    await this.db.query(`DELETE FROM mdm_lookups WHERE id=$1`, [id]);
  }
}
