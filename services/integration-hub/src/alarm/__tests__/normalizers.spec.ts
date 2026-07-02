import { normalizeZabbix } from '../normalizers/zabbix.normalizer';
import { normalizeAlertmanager } from '../normalizers/alertmanager.normalizer';
import { normalizeGrafana } from '../normalizers/grafana.normalizer';
import { mapPriority, normalizeSeverity, initPriorityMapper } from '../normalizers/priority-mapper';

// Reset priority mapper before every test to prevent state leakage
beforeEach(() => {
  delete process.env.PRIORITY_MAPPING_JSON;
  initPriorityMapper();
});

// ─── Priority mapper ──────────────────────────────────────────────────────────

describe('Priority Mapper', () => {
  beforeEach(() => { delete process.env.PRIORITY_MAPPING_JSON; initPriorityMapper(); });

  test('maps critical -> P1', () => expect(mapPriority('critical')).toBe('P1'));
  test('maps high -> P2',     () => expect(mapPriority('high')).toBe('P2'));
  test('maps warning -> P3',  () => expect(mapPriority('warning')).toBe('P3'));
  test('maps info -> P4',     () => expect(mapPriority('info')).toBe('P4'));
  test('maps unknown -> P5',  () => expect(mapPriority('unknown')).toBe('P5'));
  test('maps disaster -> P1 (Zabbix variant)', () => expect(mapPriority('disaster')).toBe('P1'));
  test('maps unknown input -> P5', () => expect(mapPriority('garbage')).toBe('P5'));

  test('PRIORITY_MAPPING_JSON overrides defaults', () => {
    process.env.PRIORITY_MAPPING_JSON = JSON.stringify({ warning: 'P2' });
    initPriorityMapper();
    expect(mapPriority('warning')).toBe('P2');
  });

  test('normalizeSeverity handles Zabbix variants', () => {
    expect(normalizeSeverity('Disaster')).toBe('high');
    expect(normalizeSeverity('Average')).toBe('high');
    expect(normalizeSeverity('Information')).toBe('info');
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
    expect(normalizeSeverity('')).toBe('unknown');
  });
});

// ─── Zabbix normalizer ────────────────────────────────────────────────────────

describe('Zabbix normalizer', () => {
  const basePayload = {
    'EVENT.ID':         '12345',
    'EVENT.NAME':       'Disk usage critical on db01',
    'EVENT.SEVERITY':   'High',
    'HOST.NAME':        'db01.example.com',
    'HOST.HOST':        'db01',
    'EVENT.TIMESTAMP':  '1700000000',
    'EVENT.VALUE':      '1',
    'TRIGGER.EXPRESSION': '{db01:system.disk.pused[/].last()} > 90',
    'TRIGGER.DESCRIPTION': 'Disk usage exceeded 90%',
    'category':         'DB',
  };

  test('maps fields correctly', () => {
    const a = normalizeZabbix(basePayload);
    expect(a.source_system).toBe('Zabbix');
    expect(a.alarm_id).toBe('12345');
    expect(a.title).toBe('Disk usage critical on db01');
    expect(a.severity).toBe('high');
    expect(a.priority).toBe('P2');
    expect(a.host_name).toBe('db01.example.com');
    expect(a.status).toBe('FIRING');
    expect(a.category).toBe('DB');
    expect(a.first_occurrence).toBeTruthy();
    expect(a.dedup_hash).toHaveLength(64);
    expect(a.correlation_id).toHaveLength(64);
    expect(a.raw_payload).toBe(basePayload);
  });

  test('RESOLVED when EVENT.VALUE=0', () => {
    const a = normalizeZabbix({ ...basePayload, 'EVENT.VALUE': '0' });
    expect(a.status).toBe('RESOLVED');
  });

  test('epoch timestamp conversion', () => {
    const a = normalizeZabbix({ ...basePayload, 'EVENT.TIMESTAMP': '1700000000' });
    expect(new Date(a.first_occurrence).getFullYear()).toBeGreaterThanOrEqual(2023);
  });

  test('prefers $SITE_ID macro if present', () => {
    const a = normalizeZabbix({ ...basePayload, '$SITE_ID': 'SITE-42' });
    expect(a.site_id).toBe('SITE-42');
  });

  test('structured JSON format', () => {
    const structured = {
      event: { id: '999', name: 'CPU high', severity: 'critical', value: 1, timestamp: 1700000000 },
      host:  { name: 'web01', host: 'web01' },
      trigger: { description: 'CPU > 95%', expression: 'last() > 95' },
    };
    const a = normalizeZabbix(structured);
    expect(a.alarm_id).toBe('999');
    expect(a.severity).toBe('critical');
    expect(a.priority).toBe('P1');
  });

  test('dedup_hash is deterministic', () => {
    const a1 = normalizeZabbix(basePayload);
    const a2 = normalizeZabbix(basePayload);
    expect(a1.dedup_hash).toBe(a2.dedup_hash);
  });
});

// ─── Alertmanager normalizer ──────────────────────────────────────────────────

describe('Alertmanager normalizer', () => {
  const payload = {
    version: '4',
    groupKey: 'test',
    status: 'firing',
    alerts: [
      {
        status: 'firing',
        fingerprint: 'abc123def456',
        labels: {
          alertname: 'HighMemoryUsage',
          severity:  'critical',
          instance:  'web01:9100',
          site_id:   'SITE-01',
          job:       'node_exporter',
          category:  'App',
        },
        annotations: {
          summary:     'Memory usage exceeds 90%',
          description: 'Memory usage on web01 is 92%',
        },
        startsAt: '2024-01-15T10:00:00Z',
        endsAt:   '0001-01-01T00:00:00Z',
      },
    ],
  };

  test('normalizes single alert', () => {
    const alarms = normalizeAlertmanager(payload);
    expect(alarms).toHaveLength(1);
    const a = alarms[0];
    expect(a.source_system).toBe('Prometheus');
    expect(a.alarm_id).toBe('abc123def456');
    expect(a.title).toBe('HighMemoryUsage');
    expect(a.severity).toBe('critical');
    expect(a.priority).toBe('P1');
    expect(a.site_id).toBe('SITE-01');
    expect(a.host_name).toBe('web01:9100');
    expect(a.category).toBe('App');
    expect(a.status).toBe('FIRING');
    expect(a.description).toContain('92%');
    expect(a.dedup_hash).toHaveLength(64);
  });

  test('resolves when status=resolved', () => {
    const resolved = {
      ...payload,
      alerts: [{ ...payload.alerts[0], status: 'resolved', endsAt: '2024-01-15T11:00:00Z' }],
    };
    const alarms = normalizeAlertmanager(resolved);
    expect(alarms[0].status).toBe('RESOLVED');
  });

  test('handles multiple alerts', () => {
    const multi = {
      ...payload,
      alerts: [
        { ...payload.alerts[0], fingerprint: 'fp1' },
        { ...payload.alerts[0], fingerprint: 'fp2', labels: { ...payload.alerts[0].labels, alertname: 'DiskFull' } },
      ],
    };
    const alarms = normalizeAlertmanager(multi);
    expect(alarms).toHaveLength(2);
    expect(alarms[0].alarm_id).toBe('fp1');
    expect(alarms[1].alarm_id).toBe('fp2');
  });

  test('falls back to unknown severity', () => {
    const a = normalizeAlertmanager({
      alerts: [{ fingerprint: 'x', labels: { alertname: 'Test' }, annotations: {}, startsAt: '2024-01-01T00:00:00Z' }],
    });
    expect(a[0].severity).toBe('unknown');
    expect(a[0].priority).toBe('P5');
  });
});

// ─── Grafana normalizer ───────────────────────────────────────────────────────

describe('Grafana normalizer', () => {
  const payload = {
    title:    '[FIRING:1] Test alert',
    state:    'alerting',
    ruleId:   42,
    ruleUID:  'rule-abc',
    ruleName: 'High CPU Usage',
    alerts: [
      {
        state:    'alerting',
        ruleId:   42,
        ruleUID:  'rule-abc',
        ruleName: 'High CPU Usage',
        labels: {
          severity: 'warning',
          instance: 'app01:8080',
          site_id:  'SITE-02',
          category: 'App',
        },
        annotations: {
          summary:     'CPU is above 80%',
          description: 'CPU on app01 reached 85%',
        },
        startsAt: '2024-01-15T12:00:00Z',
      },
    ],
  };

  test('normalizes alert correctly', () => {
    const alarms = normalizeGrafana(payload);
    expect(alarms).toHaveLength(1);
    const a = alarms[0];
    expect(a.source_system).toBe('Grafana');
    expect(a.alarm_id).toBe('42');
    expect(a.title).toBe('High CPU Usage');
    expect(a.severity).toBe('warning');
    expect(a.priority).toBe('P3');
    expect(a.site_id).toBe('SITE-02');
    expect(a.status).toBe('FIRING');
  });

  test('ok/resolved state -> RESOLVED', () => {
    const resolved = {
      ...payload,
      alerts: [{ ...payload.alerts[0], state: 'ok' }],
    };
    expect(normalizeGrafana(resolved)[0].status).toBe('RESOLVED');
  });

  test('dedup hash differs for different rules', () => {
    const a1 = normalizeGrafana({ alerts: [{ ...payload.alerts[0], ruleId: 1 }] });
    const a2 = normalizeGrafana({ alerts: [{ ...payload.alerts[0], ruleId: 2 }] });
    expect(a1[0].dedup_hash).not.toBe(a2[0].dedup_hash);
  });
});
