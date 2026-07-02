import { createHash } from 'crypto';
import { UnifiedAlarm, AlarmStatus } from '../dto/unified-alarm.dto';
import { mapPriority, normalizeSeverity } from './priority-mapper';

/** Accepts Zabbix webhook/media-type payload. Handles both macro-expanded and structured forms. */
export function normalizeZabbix(raw: Record<string, any>): UnifiedAlarm {
  // Support macro-expanded flat format {EVENT.ID}, {EVENT.NAME}, etc.
  // AND structured JSON format { event: { id, name }, host: { name }, trigger: { ... } }
  const eventId   = String(raw['EVENT.ID']  ?? raw.event?.id  ?? raw.eventid ?? 'unknown');
  const eventName = String(raw['EVENT.NAME'] ?? raw.event?.name ?? raw.name ?? '');
  const rawSeverity = String(raw['EVENT.SEVERITY'] ?? raw.event?.severity ?? raw.trigger?.severity ?? raw.severity ?? 'unknown');
  const severity  = normalizeSeverity(rawSeverity);

  // Host / site
  const hostName  = String(raw['HOST.NAME'] ?? raw.host?.name ?? raw.hostname ?? '');
  const hostHost  = String(raw['HOST.HOST'] ?? raw.host?.host ?? hostName);
  // Prefer {$SITE_ID} custom macro if present in payload
  const siteId    = String(raw['$SITE_ID'] ?? raw.site_id ?? raw['HOST.METADATA'] ?? (hostHost || hostName));

  // Timing: Zabbix sends UNIX timestamps
  const eventTs = raw['EVENT.TIMESTAMP'] ?? raw.event?.timestamp ?? raw.clock;
  const recovTs = raw['EVENT.RECOVERY.TIMESTAMP'] ?? raw.event?.recovery_timestamp;
  const firstOcc = eventTs ? epochToIso(eventTs) : new Date().toISOString();
  const lastOcc  = recovTs ? epochToIso(recovTs) : firstOcc;

  // Status
  const eventValue = String(raw['EVENT.VALUE'] ?? raw.event?.value ?? '1');
  const status: AlarmStatus = (eventValue === '0') ? 'RESOLVED' : 'FIRING';

  const trigger  = raw.trigger ?? {};
  const probableCause = String(raw['TRIGGER.EXPRESSION'] ?? trigger.expression ?? raw['ITEM.NAME'] ?? '');
  const description   = String(raw['TRIGGER.DESCRIPTION'] ?? trigger.description ?? eventName);
  const category      = String(raw.category ?? raw['TRIGGER.TAGS.category'] ?? 'Other');
  const serviceName   = String(raw.service_name ?? raw['TRIGGER.TAGS.service'] ?? '');

  const title = eventName || `Zabbix alert on ${hostName}`;

  const dedup_hash    = sha256(`Zabbix|${eventId}|${title}|${siteId}|${severity}`);
  const correlation_id = sha256(`${siteId}|${serviceName}|${category}`);

  return {
    alarm_id: eventId,
    source_system: 'Zabbix',
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
    raw_payload: raw,
  };
}

function epochToIso(ts: any): string {
  const n = parseInt(String(ts), 10);
  // Zabbix returns seconds
  return new Date((n > 1e10 ? n : n * 1000)).toISOString();
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
