import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Require a secret in production (fail-fast on startup); allow a dev-only default.
function reqSecret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devDefault;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly db: DatabaseService) {
    this.bucket = process.env.MINIO_BUCKET || 'bpm-attachments';
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: reqSecret('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: reqSecret('MINIO_SECRET_KEY', 'minioadmin123'),
    });
  }

  async upload(assignmentId: string, userId: string, tenantId: string, file: Express.Multer.File, attachmentType: string, visibilityScope: string) {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    const objectKey = `contractor/${tenantId}/${assignmentId}/${id}${ext}`;

    // Upload to MinIO
    await this.minioClient.putObject(
      this.bucket,
      objectKey,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype, 'X-Uploaded-By': userId },
    );

    // Insert DB record
    const result = await this.db.query(
      `INSERT INTO external_attachments (id, tenant_id, assignment_id, uploaded_by, file_name, object_key,
        attachment_type, visibility_scope, malware_scan_status, file_size_bytes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,NOW()) RETURNING *`,
      [id, tenantId, assignmentId, userId, file.originalname, objectKey,
       attachmentType || 'other', visibilityScope || 'shared', file.size],
    );

    return result.rows[0];
  }

  async findByAssignment(assignmentId: string, tenantId: string, includeInternal = false) {
    let sql = `SELECT * FROM external_attachments WHERE assignment_id = $1 AND tenant_id = $2`;
    if (!includeInternal) sql += ` AND visibility_scope != 'internal_only'`;
    sql += ' ORDER BY created_at ASC';
    const result = await this.db.query(sql, [assignmentId, tenantId]);
    return result.rows;
  }

  async getDownloadUrl(id: string, companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT ea.*, woa.assigned_company_id
       FROM external_attachments ea
       JOIN work_order_assignments woa ON woa.id = ea.assignment_id
       WHERE ea.id = $1 AND ea.tenant_id = $2`,
      [id, tenantId],
    );

    if (!result.rows[0]) throw new NotFoundException('Attachment not found');
    if (result.rows[0].assigned_company_id !== companyId) throw new ForbiddenException('Access denied');
    if (result.rows[0].visibility_scope === 'internal_only') throw new ForbiddenException('Access denied');

    const url = await this.minioClient.presignedGetObject(this.bucket, result.rows[0].object_key, 3600);
    return { url, expires_in: 3600 };
  }
}
