import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Client as MinioClient } from 'minio';

const BUCKET = 'bpm-attachments';

// Require a secret in production (fail-fast on startup); allow a dev-only default.
function reqSecret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devDefault;
}

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);
  private readonly minio: MinioClient;
  // Separate client used ONLY for presignedGetObject — its endpoint/port/SSL
  // become part of the signed URL handed to a real browser, which can't
  // resolve the Docker-internal `minio` hostname the internal client above
  // uses for server-to-server upload/bucket ops. Defaults to the internal
  // values so local dev (no MINIO_PUBLIC_* set) is unaffected; production
  // sets MINIO_PUBLIC_ENDPOINT/PORT/USE_SSL to the real public domain, which
  // the edge proxy forwards back to MinIO (see infra/edge/nginx.conf).
  private readonly minioPublic: MinioClient;

  constructor(private readonly db: DatabaseService) {
    const accessKey = reqSecret('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = reqSecret('MINIO_SECRET_KEY', 'minioadmin');
    this.minio = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    });
    this.minioPublic = new MinioClient({
      endPoint: process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000'),
      useSSL: (process.env.MINIO_PUBLIC_USE_SSL || process.env.MINIO_USE_SSL) === 'true',
      accessKey,
      secretKey,
    });
    this.ensureBucket().catch(e => this.logger.warn(`MinIO init: ${e.message}`));
  }

  private async ensureBucket() {
    const exists = await this.minio.bucketExists(BUCKET);
    if (!exists) await this.minio.makeBucket(BUCKET);
  }

  async upload(tenantId: string, entityType: string, entityId: string, file: Express.Multer.File, uploadedBy: string) {
    const storagePath = `${tenantId}/${entityType}/${entityId}/${Date.now()}-${file.originalname}`;
    await this.minio.putObject(BUCKET, storagePath, file.buffer, file.size, { 'Content-Type': file.mimetype });
    const r = await this.db.query(
      `INSERT INTO attachments(tenant_id, entity_type, entity_id, filename, content_type, size_bytes, storage_path, uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, entityType, entityId, file.originalname, file.mimetype, file.size, storagePath, uploadedBy],
    );
    return r.rows[0];
  }

  async list(tenantId: string, entityType: string, entityId: string) {
    // uploaded_by is stored as whatever actor.ts's X-User-ID carries — the
    // JWT sub (Keycloak id), not the internal users.id — same dual-match
    // pattern as resolveUserId() elsewhere (case.service.ts etc.).
    const r = await this.db.query(
      `SELECT a.*, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.username) as uploader_name
       FROM attachments a
       LEFT JOIN users u ON (u.id = a.uploaded_by OR u.keycloak_id = a.uploaded_by::text)
       WHERE a.tenant_id=$1 AND a.entity_type=$2 AND a.entity_id=$3
       ORDER BY a.created_at DESC`,
      [tenantId, entityType, entityId],
    );
    return r.rows;
  }

  async getPresignedUrl(tenantId: string, id: string): Promise<string> {
    const r = await this.db.query(`SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!r.rows.length) throw new NotFoundException('Attachment not found');
    const att = r.rows[0];
    return this.minioPublic.presignedGetObject(BUCKET, att.storage_path, 3600); // 1-hour URL
  }

  async remove(tenantId: string, id: string) {
    const r = await this.db.query(`SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!r.rows.length) throw new NotFoundException('Attachment not found');
    const att = r.rows[0];
    await this.minio.removeObject(BUCKET, att.storage_path).catch(() => {});
    await this.db.query(`DELETE FROM attachments WHERE id=$1`, [id]);
  }
}
