import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';

const num = (v: string | undefined, d: number) => {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Tunable via env. Defaults: archive closed cases after ~4 months, then keep
// the archive snapshot ~6 months before permanent deletion.
const ARCHIVE_AFTER_DAYS = () => num(process.env.RETENTION_ARCHIVE_AFTER_DAYS, 120);
const DELETE_AFTER_DAYS = () => num(process.env.RETENTION_DELETE_AFTER_DAYS, 180);
const BATCH = () => num(process.env.RETENTION_BATCH, 500);
const MAX_PER_RUN = () => num(process.env.RETENTION_MAX_PER_RUN, 5000);
const ENABLED = () => (process.env.RETENTION_ENABLED ?? 'true') !== 'false';
const DEFAULT_DRY_RUN = () => process.env.RETENTION_DRY_RUN === 'true';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  constructor(private readonly db: DatabaseService) {}

  // Full JSONB snapshot of a closed case + the child records that cascade-delete
  // with it, so the archive is self-contained (and restorable) for its window.
  private readonly SNAPSHOT_SELECT = `
    jsonb_build_object(
      'case',               to_jsonb(c),
      'comments',           COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM case_comments x           WHERE x.case_id = c.id), '[]'::jsonb),
      'rca',                COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM rca_records x              WHERE x.case_id = c.id), '[]'::jsonb),
      'capa',               COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM capa_actions x             WHERE x.case_id = c.id), '[]'::jsonb),
      'vendor_escalations', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM case_vendor_escalations x  WHERE x.case_id = c.id), '[]'::jsonb),
      'links',              COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM case_links x                WHERE x.from_case_id = c.id OR x.to_case_id = c.id), '[]'::jsonb),
      'work_orders',        COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM work_order_assignments x    WHERE x.case_id = c.id), '[]'::jsonb)
    )`;

  // Snapshot a terminal process instance ("request") + its tasks.
  private readonly PI_SNAPSHOT_SELECT = `
    jsonb_build_object(
      'instance', to_jsonb(pi),
      'tasks',    COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM tasks t WHERE t.process_instance_id = pi.id), '[]'::jsonb)
    )`;

  // Terminal requests eligible for archive: completed/terminated, old enough, and
  // NOT referenced by any case (cases.process_instance_id is ON DELETE NO ACTION).
  private readonly PI_ELIGIBLE = `
    pi.status IN ('completed','terminated')
    AND COALESCE(pi.completed_at, pi.updated_at) < NOW() - make_interval(days => $1)
    AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.process_instance_id = pi.id)`;

  // ── Status / overview ──────────────────────────────────────────────────────
  async getStatus() {
    const archiveAfter = ARCHIVE_AFTER_DAYS();
    const deleteAfter = DELETE_AFTER_DAYS();
    const [candC, archC, candR, archR, last] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int n FROM cases
         WHERE status='closed' AND closed_at IS NOT NULL AND closed_at < NOW() - make_interval(days => $1)`,
        [archiveAfter],
      ),
      this.db.query(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER (WHERE archived_at < NOW() - make_interval(days => $1))::int due_delete
         FROM archived_cases`,
        [deleteAfter],
      ),
      this.db.query(
        `SELECT COUNT(*)::int n FROM process_instances pi WHERE ${this.PI_ELIGIBLE}`,
        [archiveAfter],
      ),
      this.db.query(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER (WHERE archived_at < NOW() - make_interval(days => $1))::int due_delete
         FROM archived_process_instances`,
        [deleteAfter],
      ),
      this.db.query(`SELECT * FROM retention_runs ORDER BY run_at DESC LIMIT 1`),
    ]);
    return {
      enabled: ENABLED(),
      dryRun: DEFAULT_DRY_RUN(),
      archiveAfterDays: archiveAfter,
      deleteAfterDays: deleteAfter,
      scope: "closed cases + terminal process instances (catalog requests)",
      cases: {
        candidatesToArchive: candC.rows[0].n,
        archivedTotal: archC.rows[0].total,
        archivedDueDelete: archC.rows[0].due_delete,
      },
      requests: {
        candidatesToArchive: candR.rows[0].n,
        archivedTotal: archR.rows[0].total,
        archivedDueDelete: archR.rows[0].due_delete,
      },
      lastRun: last.rows[0] || null,
    };
  }

  async listRuns(limit = 50) {
    const r = await this.db.query(`SELECT * FROM retention_runs ORDER BY run_at DESC LIMIT $1`, [Math.min(limit, 200)]);
    return r.rows;
  }

  // ── Archive (stage 1) ──────────────────────────────────────────────────────
  private async archiveClosedCases(archiveAfterDays: number): Promise<number> {
    let total = 0;
    const cap = MAX_PER_RUN();
    while (total < cap) {
      const batch = await this.db.query(
        `SELECT id FROM cases
         WHERE status='closed' AND closed_at IS NOT NULL AND closed_at < NOW() - make_interval(days => $1)
         ORDER BY closed_at ASC LIMIT $2`,
        [archiveAfterDays, Math.min(BATCH(), cap - total)],
      );
      if (!batch.rows.length) break;

      for (const { id } of batch.rows) {
        await this.db.withTransaction(async (client) => {
          const snap = await client.query(
            `SELECT ${this.SNAPSHOT_SELECT} AS snapshot,
                    c.tenant_id, c.case_number, c.type, c.title, c.status, c.closed_at, c.created_at
             FROM cases c WHERE c.id = $1`,
            [id],
          );
          if (!snap.rows[0]) return;
          const s = snap.rows[0];
          await client.query(
            `INSERT INTO archived_cases (id, tenant_id, case_number, type, title, status, closed_at, case_created_at, snapshot)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO NOTHING`,
            [id, s.tenant_id, s.case_number, s.type, s.title, s.status, s.closed_at, s.created_at, s.snapshot],
          );
          // FK cascades remove comments/rca/capa/escalations/links/work-orders;
          // tasks & process_instances keep their rows (case_id set null).
          await client.query(`DELETE FROM cases WHERE id = $1`, [id]);
        });
        total++;
      }
      if (batch.rows.length < BATCH()) break;
    }
    return total;
  }

  // ── Purge archive (stage 2) ─────────────────────────────────────────────────
  private async purgeArchive(deleteAfterDays: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM archived_cases WHERE archived_at < NOW() - make_interval(days => $1)`,
      [deleteAfterDays],
    );
    return r.rowCount || 0;
  }

  // ── Requests: archive (stage 1) / purge (stage 2) ───────────────────────────
  private async archiveTerminalRequests(archiveAfterDays: number): Promise<number> {
    let total = 0;
    const cap = MAX_PER_RUN();
    while (total < cap) {
      const batch = await this.db.query(
        `SELECT pi.id FROM process_instances pi WHERE ${this.PI_ELIGIBLE}
         ORDER BY COALESCE(pi.completed_at, pi.updated_at) ASC LIMIT $2`,
        [archiveAfterDays, Math.min(BATCH(), cap - total)],
      );
      if (!batch.rows.length) break;

      for (const { id } of batch.rows) {
        await this.db.withTransaction(async (client) => {
          const snap = await client.query(
            `SELECT ${this.PI_SNAPSHOT_SELECT} AS snapshot,
                    pi.tenant_id, pi.definition_id, pi.business_key, pi.status, pi.started_at, pi.completed_at
             FROM process_instances pi WHERE pi.id = $1`,
            [id],
          );
          if (!snap.rows[0]) return;
          const s = snap.rows[0];
          await client.query(
            `INSERT INTO archived_process_instances
               (id, tenant_id, definition_id, business_key, status, started_at, completed_at, snapshot)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
            [id, s.tenant_id, s.definition_id, s.business_key, s.status, s.started_at, s.completed_at, s.snapshot],
          );
          // tasks cascade-delete with the instance.
          await client.query(`DELETE FROM process_instances WHERE id = $1`, [id]);
        });
        total++;
      }
      if (batch.rows.length < BATCH()) break;
    }
    return total;
  }

  private async purgeArchivedRequests(deleteAfterDays: number): Promise<number> {
    const r = await this.db.query(
      `DELETE FROM archived_process_instances WHERE archived_at < NOW() - make_interval(days => $1)`,
      [deleteAfterDays],
    );
    return r.rowCount || 0;
  }

  // ── Orchestration ────────────────────────────────────────────────────────────
  async runRetention(trigger: 'scheduled' | 'manual', dryRunOverride?: boolean) {
    const archiveAfter = ARCHIVE_AFTER_DAYS();
    const deleteAfter = DELETE_AFTER_DAYS();
    const dryRun = dryRunOverride ?? DEFAULT_DRY_RUN();
    const started = Date.now();

    const c = { candidatesArchive: 0, archived: 0, candidatesDelete: 0, deleted: 0 };
    const r = { candidatesArchive: 0, archived: 0, candidatesDelete: 0, deleted: 0 };
    let status: 'success' | 'failed' = 'success';
    let error: string | null = null;

    try {
      // Candidates (both entities).
      c.candidatesArchive = (await this.db.query(
        `SELECT COUNT(*)::int n FROM cases
         WHERE status='closed' AND closed_at IS NOT NULL AND closed_at < NOW() - make_interval(days => $1)`,
        [archiveAfter])).rows[0].n;
      c.candidatesDelete = (await this.db.query(
        `SELECT COUNT(*)::int n FROM archived_cases WHERE archived_at < NOW() - make_interval(days => $1)`,
        [deleteAfter])).rows[0].n;
      r.candidatesArchive = (await this.db.query(
        `SELECT COUNT(*)::int n FROM process_instances pi WHERE ${this.PI_ELIGIBLE}`,
        [archiveAfter])).rows[0].n;
      r.candidatesDelete = (await this.db.query(
        `SELECT COUNT(*)::int n FROM archived_process_instances WHERE archived_at < NOW() - make_interval(days => $1)`,
        [deleteAfter])).rows[0].n;

      if (!dryRun) {
        // Cases first so their now-unreferenced process instances become eligible.
        c.archived = await this.archiveClosedCases(archiveAfter);
        c.deleted = await this.purgeArchive(deleteAfter);
        r.archived = await this.archiveTerminalRequests(archiveAfter);
        r.deleted = await this.purgeArchivedRequests(deleteAfter);
      }
    } catch (e: any) {
      status = 'failed';
      error = e?.message || 'retention failed';
      this.logger.error(`Retention run failed: ${error}`);
    }

    const duration = Date.now() - started;
    const candidatesArchive = c.candidatesArchive + r.candidatesArchive;
    const candidatesDelete = c.candidatesDelete + r.candidatesDelete;
    const archived = c.archived + r.archived;
    const deleted = c.deleted + r.deleted;
    const run = await this.db.query(
      `INSERT INTO retention_runs
         (trigger, dry_run, archive_after_days, delete_after_days,
          candidates_archive, archived_count, candidates_delete, deleted_count, duration_ms, status, error, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [trigger, dryRun, archiveAfter, deleteAfter, candidatesArchive, archived, candidatesDelete, deleted, duration, status, error,
       JSON.stringify({ cases: c, requests: r })],
    );
    this.logger.log(
      `Retention (${trigger}${dryRun ? ', dry-run' : ''}): cases ${dryRun ? `would archive ${c.candidatesArchive}/delete ${c.candidatesDelete}` : `archived ${c.archived}/deleted ${c.deleted}`}; ` +
      `requests ${dryRun ? `would archive ${r.candidatesArchive}/delete ${r.candidatesDelete}` : `archived ${r.archived}/deleted ${r.deleted}`} in ${duration}ms`,
    );
    return run.rows[0];
  }

  // ── Archived access (lookup + restore during the retention window) ──────────
  // kind: 'case' (default) → archived_cases | 'request' → archived_process_instances
  async listArchived(kind = 'case', search?: string, page = 1, pageSize = 25) {
    const offset = (Math.max(1, page) - 1) * pageSize;
    const vals: any[] = [];
    let where = '';
    if (kind === 'request') {
      if (search) { vals.push(`%${search}%`); where = `WHERE business_key ILIKE $${vals.length}`; }
      const [rows, count] = await Promise.all([
        this.db.query(
          `SELECT id, tenant_id, definition_id, business_key, status, started_at, completed_at, archived_at
           FROM archived_process_instances ${where} ORDER BY archived_at DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
          [...vals, pageSize, offset]),
        this.db.query(`SELECT COUNT(*)::int n FROM archived_process_instances ${where}`, vals),
      ]);
      return { kind, data: rows.rows, total: count.rows[0].n, page, pageSize };
    }
    if (search) { vals.push(`%${search}%`); where = `WHERE (case_number ILIKE $${vals.length} OR title ILIKE $${vals.length})`; }
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT id, tenant_id, case_number, type, title, status, closed_at, case_created_at, archived_at
         FROM archived_cases ${where} ORDER BY archived_at DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
        [...vals, pageSize, offset]),
      this.db.query(`SELECT COUNT(*)::int n FROM archived_cases ${where}`, vals),
    ]);
    return { kind: 'case', data: rows.rows, total: count.rows[0].n, page, pageSize };
  }

  async getArchived(kind = 'case', id: string) {
    const table = kind === 'request' ? 'archived_process_instances' : 'archived_cases';
    const r = await this.db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new NotFoundException('Archived record not found');
    return r.rows[0];
  }

  // Safety valve: re-insert the record (+ children) from its snapshot and remove
  // it from the archive. Best-effort restore of the core record.
  async restoreArchived(kind = 'case', id: string) {
    if (kind === 'request') return this.restoreRequest(id);
    return this.db.withTransaction(async (client) => {
      const a = await client.query(`SELECT snapshot FROM archived_cases WHERE id = $1`, [id]);
      if (!a.rows[0]) throw new NotFoundException('Archived case not found');
      const snap = a.rows[0].snapshot;
      await client.query(
        `INSERT INTO cases SELECT (jsonb_populate_record(NULL::cases, $1::jsonb)).* ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(snap.case)],
      );
      if (Array.isArray(snap.comments) && snap.comments.length) {
        await client.query(
          `INSERT INTO case_comments
           SELECT (jsonb_populate_record(NULL::case_comments, elem)).*
           FROM jsonb_array_elements($1::jsonb) elem ON CONFLICT (id) DO NOTHING`,
          [JSON.stringify(snap.comments)],
        );
      }
      await client.query(`DELETE FROM archived_cases WHERE id = $1`, [id]);
      return { restored: true, kind: 'case', id };
    });
  }

  private async restoreRequest(id: string) {
    return this.db.withTransaction(async (client) => {
      const a = await client.query(`SELECT snapshot FROM archived_process_instances WHERE id = $1`, [id]);
      if (!a.rows[0]) throw new NotFoundException('Archived request not found');
      const snap = a.rows[0].snapshot;
      await client.query(
        `INSERT INTO process_instances SELECT (jsonb_populate_record(NULL::process_instances, $1::jsonb)).* ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(snap.instance)],
      );
      if (Array.isArray(snap.tasks) && snap.tasks.length) {
        await client.query(
          `INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks, elem)).*
           FROM jsonb_array_elements($1::jsonb) elem ON CONFLICT (id) DO NOTHING`,
          [JSON.stringify(snap.tasks)],
        );
      }
      await client.query(`DELETE FROM archived_process_instances WHERE id = $1`, [id]);
      return { restored: true, kind: 'request', id };
    });
  }

  // ── Scheduler: nightly 02:30 ────────────────────────────────────────────────
  @Cron(process.env.RETENTION_CRON || '0 30 2 * * *')
  async nightly() {
    if (!ENABLED()) { this.logger.log('Retention disabled (RETENTION_ENABLED=false) — skipping'); return; }
    await this.runRetention('scheduled');
  }
}
