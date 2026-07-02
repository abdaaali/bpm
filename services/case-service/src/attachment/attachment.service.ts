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

  constructor(private readonly db: DatabaseService) {
    this.minio = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: reqSecret('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: reqSecret('MINIO_SECRET_KEY', 'minioadmin'),
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
    const r = await this.db.query(
      `SELECT a.*, u.display_name as uploader_name FROM attachments a
       LEFT JOIN users u ON u.id=a.uploaded_by
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
    return this.minio.presignedGetObject(BUCKET, att.storage_path, 3600); // 1-hour URL
  }

  async remove(tenantId: string, id: string) {
    const r = await this.db.query(`SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!r.rows.length) throw new NotFoundException('Attachment not found');
    const att = r.rows[0];
    await this.minio.removeObject(BUCKET, att.storage_path).catch(() => {});
    await this.db.query(`DELETE FROM attachments WHERE id=$1`, [id]);
  }
}
