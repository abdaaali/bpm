import { createHash } from 'crypto';
import { UnifiedAlarm, AlarmStatus } from '../dto/unified-alarm.dto';
import { mapPriority, normalizeSeverity } from './priority-mapper';

/** Prometheus Alertmanager webhook payload — alerts[] array. Returns one UnifiedAlarm per alert. */
export function normalizeAlertmanager(raw: Record<string, any>): UnifiedAlarm[] {
  const alerts: any[] = Array.isArray(raw.alerts) ? raw.alerts : [raw];
  return alerts.map(alert => normalizeOneAlert(alert, raw));
}

function normalizeOneAlert(alert: any, root: Record<string, any>): UnifiedAlarm {
  const labels      = alert.labels ?? {};
  const annotations = alert.annotations ?? {};

  const alarmId   = String(alert.fingerprint ?? alert.id ?? 'unknown');
  const title     = String(labels.alertname ?? annotations.summary ?? 'Prometheus alert');
  const rawSev    = String(labels.severity ?? labels.priority ?? 'unknown');
  const severity  = normalizeSeverity(rawSev);

  const hostName  = String(labels.instance ?? labels.node ?? labels.host ?? '');
  const siteId    = String(labels.site_id ?? labels.site ?? labels.instance ?? hostName);
  const serviceName = String(labels.service ?? labels.job ?? '');
  const category  = String(labels.category ?? deriveCategory(labels.job ?? ''));

  const firstOcc  = alert.startsAt ? isoOrNow(alert.startsAt) : new Date().toISOString();
  const endsAt    = alert.endsAt;
  const lastOcc   = (endsAt && endsAt !== '0001-01-01T00:00:00Z') ? isoOrNow(endsAt) : firstOcc;

  const statusStr = String(alert.status ?? root.status ?? 'firing').toLowerCase();
  const status: AlarmStatus = (statusStr === 'resolved') ? 'RESOLVED' : 'FIRING';

  const description   = String(annotations.description ?? annotations.summary ?? '');
  const probableCause = String(annotations.summary ?? alert.generatorURL ?? '');

  const dedup_hash    = sha256(`Prometheus|${alarmId}|${title}|${siteId}|${severity}`);
  const correlation_id = sha256(`${siteId}|${serviceName}|${category}`);

  return {
    alarm_id: alarmId,
    source_system: 'Prometheus',
    severity,
    priority: mapPriority(severity),
    title,
    description,
    site_id: siteId,
    host_name: hostName,
    service_name: serviceName || undefined,
    category: category || 'Other',
    first_occurrence: firstOcc,
    last_occurrence: lastOcc,
    status,
    probable_cause: probableCause || undefined,
    event_count: 1,
    correlation_id,
    dedup_hash,
    raw_payload: alert,
  };
}

function deriveCategory(job: string): string {
  const j = job.toLowerCase();
  if (j.includes('kafka') || j.includes('redis') || j.includes('rabbit')) return 'Core';
  if (j.includes('postgres') || j.includes('mysql') || j.includes('mongo')) return 'DB';
  if (j.includes('node') || j.includes('nginx') || j.includes('app')) return 'App';
  return 'Other';
}

function isoOrNow(val: string): string {
  try { return new Date(val).toISOString(); } catch { return new Date().toISOString(); }
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
