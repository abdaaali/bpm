import { createHash } from 'crypto';
import { UnifiedAlarm, AlarmStatus } from '../dto/unified-alarm.dto';
import { mapPriority, normalizeSeverity } from './priority-mapper';

/** Grafana Unified Alerting webhook payload. May contain alerts[] or a single alert object. */
export function normalizeGrafana(raw: Record<string, any>): UnifiedAlarm[] {
  const alerts: any[] = Array.isArray(raw.alerts) ? raw.alerts : [raw];
  return alerts.map(alert => normalizeOneAlert(alert, raw));
}

function normalizeOneAlert(alert: any, root: Record<string, any>): UnifiedAlarm {
  const labels      = alert.labels ?? {};
  const annotations = alert.annotations ?? {};

  // alarm_id: prefer ruleId (numeric stable) or ruleUID (string stable)
  const alarmId   = String(alert.ruleId ?? alert.ruleUID ?? alert.fingerprint ?? 'unknown');
  const title     = String(alert.ruleName ?? root.title ?? alert.name ?? annotations.summary ?? 'Grafana alert');
  const rawSev    = String(labels.severity ?? labels.priority ?? 'unknown');
  const severity  = normalizeSeverity(rawSev);

  const hostName  = String(labels.instance ?? labels.host ?? labels.node ?? '');
  const siteId    = String(labels.site_id ?? labels.site ?? labels.instance ?? hostName);
  const serviceName = String(labels.service ?? labels.job ?? '');
  const category  = String(labels.category ?? 'Other');

  const firstOcc  = alert.startsAt  ? isoOrNow(alert.startsAt)  : new Date().toISOString();
  const endsAt    = alert.endsAt;
  const lastOcc   = (endsAt && endsAt !== '0001-01-01T00:00:00Z') ? isoOrNow(endsAt) : firstOcc;

  // Grafana state: alerting | firing | pending | ok | resolved | no_data
  const stateStr  = String(alert.state ?? alert.status ?? root.state ?? 'alerting').toLowerCase();
  const status: AlarmStatus = (stateStr === 'ok' || stateStr === 'resolved') ? 'RESOLVED' : 'FIRING';

  const description   = String(annotations.description ?? annotations.summary ?? '');
  const probableCause = String(annotations.summary ?? alert.generatorURL ?? alert.panelURL ?? '');

  const dedup_hash    = sha256(`Grafana|${alarmId}|${title}|${siteId}|${severity}`);
  const correlation_id = sha256(`${siteId}|${serviceName}|${category}`);

  return {
    alarm_id: alarmId,
    source_system: 'Grafana',
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

function isoOrNow(val: string): string {
  try { return new Date(val).toISOString(); } catch { return new Date().toISOString(); }
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
