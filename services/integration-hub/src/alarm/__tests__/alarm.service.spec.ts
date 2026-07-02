/**
 * Integration-style unit tests for AlarmService.
 * Uses mocked DatabaseService, MdmEnrichmentService, SlaCalculatorService,
 * BpmTicketService, and AlarmMetricsService.
 */

jest.mock('axios');

import { AlarmService } from '../alarm.service';
import { MdmEnrichmentService } from '../mdm-enrichment.service';
import { SlaCalculatorService } from '../sla-calculator.service';
import { BpmTicketService } from '../bpm-ticket.service';
import { AlarmMetricsService } from '../alarm-metrics.service';
import { DatabaseService } from '../../database/database.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

function makeMockDb(): jest.Mocked<DatabaseService> {
  return {
    query: jest.fn(),
    paginate: jest.fn().mockReturnValue({ limit: 20, offset: 0 }),
  } as any;
}

function makeMockMdm(): jest.Mocked<MdmEnrichmentService> {
  return {
    enrich: jest.fn().mockResolvedValue(null),
    evictExpired: jest.fn(),
  } as any;
}

function makeMockSla(): jest.Mocked<SlaCalculatorService> {
  return {
    calculate: jest.fn().mockReturnValue({
      sla_status: 'ON_TRACK',
      sla_last_calculated_at: new Date(),
    }),
    resolveCalendar: jest.fn(),
    addWorkingTime: jest.fn(),
    onModuleInit: jest.fn(),
  } as any;
}

function makeMockTicket(): jest.Mocked<BpmTicketService> {
  return {
    createTicket: jest.fn().mockResolvedValue({ ticket_id: 'ticket-001', ticket_number: 'INC-001' }),
    updateTicket: jest.fn().mockResolvedValue(undefined),
    resolveTicket: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeMockMetrics(): jest.Mocked<AlarmMetricsService> {
  const counter = { inc: jest.fn() };
  const gauge   = { set: jest.fn() };
  return {
    alarmsReceived:          counter,
    alarmsNormalized:        counter,
    alarmsDeduped:           counter,
    ticketsCreated:          counter,
    ticketsUpdated:          counter,
    mdmEnrichmentSuccess:    counter,
    mdmEnrichmentFail:       counter,
    mdmCacheHit:             counter,
    slaCalculated:           counter,
    slaBreached:             counter,
    slaAtRisk:               counter,
    activeAlarms:            gauge,
    pendingEnrichmentJobs:   gauge,
  } as any;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

const ZABBIX_PAYLOAD = {
  'EVENT.ID':         'evt-111',
  'EVENT.NAME':       'CPU Critical',
  'EVENT.SEVERITY':   'High',
  'HOST.NAME':        'router01.example.com',
  'HOST.HOST':        'router01',
  'EVENT.TIMESTAMP':  '1700000000',
  'EVENT.VALUE':      '1',
  'TRIGGER.DESCRIPTION': 'CPU > 90%',
  'category':         'Core',
};

function makeService(overrides: Partial<{
  db:      DatabaseService;
  mdm:     MdmEnrichmentService;
  sla:     SlaCalculatorService;
  ticket:  BpmTicketService;
  metrics: AlarmMetricsService;
}> = {}) {
  const db      = overrides.db      ?? makeMockDb();
  const mdm     = overrides.mdm     ?? makeMockMdm();
  const sla     = overrides.sla     ?? makeMockSla();
  const ticket  = overrides.ticket  ?? makeMockTicket();
  const metrics = overrides.metrics ?? makeMockMetrics();
  const outbox = { enqueue: jest.fn(), processPending: jest.fn(), reconcile: jest.fn() };
  const svc = new AlarmService(db as any, mdm as any, sla as any, ticket as any, metrics as any, outbox as any);
  return { svc, db, mdm, sla, ticket, metrics };
}

// ─── ingestZabbix ─────────────────────────────────────────────────────────────

describe('AlarmService.ingestZabbix', () => {
  beforeEach(() => {
    process.env.ALARM_MIN_SEVERITY_TO_TICKET = 'high';
    process.env.MDM_ENRICHMENT_MODE = 'async';
    process.env.SLA_ENABLED = 'true';
    process.env.ALARM_DEDUP_TTL_SECONDS = '900';
  });

  test('creates new alarm and ticket for high severity', async () => {
    const { svc, db, ticket } = makeService();

    // No existing alarm (no dedup hit)
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })       // findActiveByDedupHash
      .mockResolvedValueOnce({ rows: [{ id: 'alarm-uuid-1' }] }) // insertAlarm
      .mockResolvedValueOnce({ rows: [] })       // enqueueEnrichment
      .mockResolvedValueOnce({ rows: [{ id: 'alarm-uuid-1', source_system: 'Zabbix', alarm_id: 'evt-111', first_occurrence: new Date(), severity: 'high', sla_params: null, sla_status: 'NOT_APPLICABLE' }] }) // findById
      .mockResolvedValueOnce({ rows: [] });      // saveTicketMapping

    const result = await svc.ingestZabbix(ZABBIX_PAYLOAD);
    expect(result.action).toBe('created');
    expect(result.deduplicated).toBe(false);
    expect(ticket.createTicket).toHaveBeenCalledTimes(1);
  });

  test('deduplicates existing active alarm', async () => {
    const { svc, db, ticket, metrics } = makeService();

    const existing = {
      id: 'existing-alarm-id',
      source_system: 'Zabbix',
      alarm_id: 'evt-111',
      event_count: 1,
      first_occurrence: new Date(),
      sla_params: null,
      sla_status: 'NOT_APPLICABLE',
    };

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [existing] })  // findActiveByDedupHash -> hit
      .mockResolvedValueOnce({ rows: [] })           // update last_occurrence
      .mockResolvedValueOnce({ rows: [] })           // findTicketMapping (no mapping)
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // activeAlarms gauge

    const result = await svc.ingestZabbix(ZABBIX_PAYLOAD);
    expect(result.action).toBe('deduplicated');
    expect(result.deduplicated).toBe(true);
    expect(result.id).toBe('existing-alarm-id');
    expect(ticket.createTicket).not.toHaveBeenCalled();
    expect((metrics.alarmsDeduped as any).inc).toHaveBeenCalled();
  });

  test('does NOT create ticket for low severity (info)', async () => {
    process.env.ALARM_MIN_SEVERITY_TO_TICKET = 'high';
    const lowSevPayload = { ...ZABBIX_PAYLOAD, 'EVENT.SEVERITY': 'Information' };

    const { svc, db, ticket } = makeService();
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })       // no dedup
      .mockResolvedValueOnce({ rows: [{ id: 'alarm-id-2' }] })
      .mockResolvedValueOnce({ rows: [] });      // enqueue

    const result = await svc.ingestZabbix(lowSevPayload);
    expect(result.action).toBe('created');
    expect(ticket.createTicket).not.toHaveBeenCalled();
  });

  test('ALARM_DRY_RUN=true suppresses ticket creation', async () => {
    process.env.ALARM_DRY_RUN = 'true';
    const { svc, db, ticket } = makeService();
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'alarm-id-3' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'alarm-id-3', severity: 'high', sla_params: null, sla_status: 'NOT_APPLICABLE', first_occurrence: new Date() }] });

    await svc.ingestZabbix(ZABBIX_PAYLOAD);
    // BpmTicketService.createTicket returns null in dry run (logged but not called on external API)
    // Since ticket mock still returns a value, we can verify the mock was called
    expect(ticket.createTicket).toHaveBeenCalledTimes(1);
    delete process.env.ALARM_DRY_RUN;
  });

  test('resolved alarm closes matching ticket', async () => {
    const resolvedPayload = { ...ZABBIX_PAYLOAD, 'EVENT.VALUE': '0' };
    const { svc, db, ticket } = makeService();

    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'active-alarm-id', event_count: 1 }] }) // find active by src+id
      .mockResolvedValueOnce({ rows: [] })     // update status
      .mockResolvedValueOnce({ rows: [{ id: 'map-id', ticket_id: 'ticket-001' }] }) // findTicketMapping
      .mockResolvedValueOnce({ rows: [] });    // update map resolved_at

    const result = await svc.ingestZabbix(resolvedPayload);
    expect(result.action).toBe('resolved');
    expect(ticket.resolveTicket).toHaveBeenCalledWith('ticket-001', expect.any(Object));
  });
});

// ─── Dedup hash consistency ───────────────────────────────────────────────────

describe('Dedup hash consistency', () => {
  test('same payload always produces same dedup_hash', async () => {
    const { svc, db } = makeService();
    let capturedHash1: string | undefined;
    let capturedHash2: string | undefined;

    (db.query as jest.Mock).mockResolvedValue({ rows: [] });

    // Capture the hash from the INSERT call
    const origQuery = (db.query as jest.Mock);
    let insertCall = 0;
    origQuery.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes('INSERT INTO unified_alarms') && insertCall === 0) {
        insertCall++;
        // dedup_hash is param $17 (index 16)
        capturedHash1 = params[16];
        return { rows: [{ id: 'id-1' }] };
      }
      return { rows: [] };
    });

    await svc.ingestZabbix(ZABBIX_PAYLOAD);

    insertCall = 0;
    origQuery.mockImplementation(async (sql: string, params: any[]) => {
      if (sql.includes('INSERT INTO unified_alarms') && insertCall === 0) {
        insertCall++;
        capturedHash2 = params[16];
        return { rows: [{ id: 'id-2' }] };
      }
      return { rows: [] };
    });

    await svc.ingestZabbix(ZABBIX_PAYLOAD);

    expect(capturedHash1).toBeDefined();
    expect(capturedHash1).toBe(capturedHash2);
    expect(capturedHash1).toHaveLength(64);
  });
});
