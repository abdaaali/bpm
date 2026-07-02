import { SlaCalculatorService, CalendarDef } from '../sla-calculator.service';
import { SlaParams } from '../dto/unified-alarm.dto';

function makeService(): SlaCalculatorService {
  const svc = new SlaCalculatorService();
  svc.onModuleInit();
  process.env.SLA_ENABLED = 'true';
  process.env.SLA_FAIL_OPEN = 'true';
  process.env.SLA_AT_RISK_THRESHOLD_PERCENT = '20';
  return svc;
}

const CAL_24x7: CalendarDef = {
  type: '24x7',
  timezone: 'UTC',
  workingDays: [0,1,2,3,4,5,6],
  startHour: 0,
  endHour: 24,
};

const CAL_BH: CalendarDef = {
  type: 'business_hours',
  timezone: 'UTC',
  workingDays: [1,2,3,4,5],  // Mon-Fri
  startHour: 8,
  endHour: 18,
};

// ─── addWorkingTime ────────────────────────────────────────────────────────────

describe('SlaCalculatorService.addWorkingTime', () => {
  const svc = makeService();

  describe('24x7 calendar', () => {
    test('adds minutes correctly', () => {
      const start  = new Date('2024-01-15T10:00:00Z');
      const result = svc.addWorkingTime(start, 60, CAL_24x7);
      expect(result.getTime()).toBe(start.getTime() + 60 * 60_000);
    });

    test('adds zero minutes = same time', () => {
      const start  = new Date('2024-01-15T10:00:00Z');
      const result = svc.addWorkingTime(start, 0, CAL_24x7);
      expect(result.getTime()).toBe(start.getTime());
    });

    test('spans midnight', () => {
      const start  = new Date('2024-01-15T23:00:00Z');
      const result = svc.addWorkingTime(start, 120, CAL_24x7);
      expect(result).toEqual(new Date('2024-01-16T01:00:00Z'));
    });
  });

  describe('business_hours calendar', () => {
    test('30 min within same day', () => {
      const start  = new Date('2024-01-15T09:00:00Z'); // Monday 09:00 UTC
      const result = svc.addWorkingTime(start, 30, CAL_BH);
      expect(result).toEqual(new Date('2024-01-15T09:30:00Z'));
    });

    test('spans end-of-day into next morning', () => {
      // Monday 17:30 + 60 min = Tuesday 08:30
      const start  = new Date('2024-01-15T17:30:00Z');
      const result = svc.addWorkingTime(start, 60, CAL_BH);
      // 30 min to EOD (18:00), 30 min into next working day (Tue 08:30)
      expect(result).toEqual(new Date('2024-01-16T08:30:00Z'));
    });

    test('start before working hours -> advances to start', () => {
      // Monday 06:00 (before 08:00) + 30 min = Monday 08:30
      const start  = new Date('2024-01-15T06:00:00Z');
      const result = svc.addWorkingTime(start, 30, CAL_BH);
      expect(result).toEqual(new Date('2024-01-15T08:30:00Z'));
    });

    test('start on Saturday -> advances to Monday', () => {
      // Saturday 10:00 + 60 min = Monday 09:00
      const start  = new Date('2024-01-13T10:00:00Z'); // Saturday
      const result = svc.addWorkingTime(start, 60, CAL_BH);
      expect(result).toEqual(new Date('2024-01-15T09:00:00Z'));
    });

    test('full day (600 min = exactly one working day, lands at EOD)', () => {
      // Monday 08:00 + 600 min = exactly 18:00 Monday (end of working day)
      const start  = new Date('2024-01-15T08:00:00Z');
      const result = svc.addWorkingTime(start, 600, CAL_BH);
      expect(result).toEqual(new Date('2024-01-15T18:00:00Z'));
    });

    test('601 minutes spans into next working day', () => {
      // Monday 08:00 + 601 min = Tuesday 08:01
      const start  = new Date('2024-01-15T08:00:00Z');
      const result = svc.addWorkingTime(start, 601, CAL_BH);
      expect(result).toEqual(new Date('2024-01-16T08:01:00Z'));
    });
  });

  describe('blackout windows', () => {
    test('skips blackout period', () => {
      const blackoutStart = new Date('2024-01-15T10:00:00Z');
      const blackoutEnd   = new Date('2024-01-15T12:00:00Z');
      const cal: CalendarDef = {
        ...CAL_24x7,
        blackouts: [{ start: blackoutStart, end: blackoutEnd }],
      };
      // Start at 09:00, add 120 min. 60 min gets us to 10:00 (blackout), skip 2h to 12:00, then 60 min = 13:00
      const start  = new Date('2024-01-15T09:00:00Z');
      const result = svc.addWorkingTime(start, 120, cal);
      expect(result).toEqual(new Date('2024-01-15T13:00:00Z'));
    });
  });
});

// ─── Full SLA calculation ─────────────────────────────────────────────────────

describe('SlaCalculatorService.calculate', () => {
  const svc = makeService();

  const params24x7: SlaParams = {
    sla_profile_id:      'TEST_P1',
    sla_calendar_id:     '24x7',
    sla_timezone:        'UTC',
    sla_start_rule:      'alarm_first_occurrence',
    response_time_minutes: 15,
    onsite_time_minutes:   60,
    restore_time_minutes:  240,
    travel_time_minutes:   30,
    access_time_minutes:   15,
  };

  test('24x7: computes all due times', () => {
    const start = new Date('2024-01-15T10:00:00Z');
    const r = svc.calculate(params24x7, start);
    // response = start + 15m
    expect(r.response_due_at).toEqual(new Date('2024-01-15T10:15:00Z'));
    // onsite  = start + 60 + 30 + 15 = 105m
    expect(r.onsite_due_at).toEqual(new Date('2024-01-15T11:45:00Z'));
    // restore = start + 240 + 30 + 15 = 285m
    expect(r.restore_due_at).toEqual(new Date('2024-01-15T14:45:00Z'));
    expect(r.sla_breach_at).toEqual(r.restore_due_at);
    expect(r.sla_remaining_seconds).toBeDefined();
  });

  test('status ON_TRACK for fresh alarm', () => {
    // Start 1 minute ago, restore in 240 min -> well within range
    const start = new Date(Date.now() - 60_000);
    const r = svc.calculate({ ...params24x7, restore_time_minutes: 240 }, start);
    expect(r.sla_status).toBe('ON_TRACK');
  });

  test('status BREACHED when past breach time', () => {
    // Start 300 minutes ago, restore was 240 min -> already breached
    const start = new Date(Date.now() - 300 * 60_000);
    const r = svc.calculate({ ...params24x7, restore_time_minutes: 240 }, start);
    expect(r.sla_status).toBe('BREACHED');
  });

  test('status AT_RISK when within last 20%', () => {
    // restore = 100 min, start at 83 min ago (17 min remaining = 17% < 20%)
    const start = new Date(Date.now() - 83 * 60_000);
    const p: SlaParams = {
      sla_calendar_id: '24x7',
      sla_timezone: 'UTC',
      restore_time_minutes: 100,
    };
    const r = svc.calculate(p, start);
    expect(r.sla_status).toBe('AT_RISK');
  });

  test('status PAUSED when isPaused=true', () => {
    const start = new Date(Date.now() - 60_000);
    const r = svc.calculate(params24x7, start, true, new Date());
    expect(r.sla_status).toBe('PAUSED');
  });

  test('NOT_APPLICABLE when no restore_time_minutes', () => {
    const r = svc.calculate({}, new Date());
    expect(r.sla_status).toBe('NOT_APPLICABLE');
  });

  test('fail-open on error', () => {
    // Pass invalid params
    const r = svc.calculate(null as any, new Date());
    expect(r.sla_status).toBe('NOT_APPLICABLE');
  });

  test('start rules: ticket_created falls back to first_occurrence', () => {
    const start = new Date('2024-01-15T10:00:00Z');
    const p: SlaParams = { ...params24x7, sla_start_rule: 'ticket_created' };
    const r = svc.calculate(p, start);
    // response = start + 15m regardless of rule (fallback to same startAt)
    expect(r.response_due_at).toEqual(new Date('2024-01-15T10:15:00Z'));
  });

  test('travel + access time are included in onsite/restore', () => {
    const start = new Date('2024-01-15T10:00:00Z');
    const p: SlaParams = {
      sla_calendar_id: '24x7',
      sla_timezone: 'UTC',
      restore_time_minutes: 120,
      travel_time_minutes: 30,
      access_time_minutes: 10,
    };
    const r = svc.calculate(p, start);
    // restore = 120 + 30 + 10 = 160 min
    expect(r.restore_due_at).toEqual(new Date('2024-01-15T12:40:00Z'));
  });
});

// ─── Calendar resolution ─────────────────────────────────────────────────────

describe('SlaCalculatorService.resolveCalendar', () => {
  const svc = makeService();

  test('24x7 ID -> 24x7 calendar', () => {
    const c = svc.resolveCalendar('24x7', 'UTC');
    expect(c.type).toBe('24x7');
  });

  test('business hours ID -> business_hours calendar', () => {
    const c = svc.resolveCalendar('UAE_BUSINESS_HOURS', 'Asia/Dubai');
    expect(c.type).toBe('business_hours');
    expect(c.timezone).toBe('Asia/Dubai');
  });

  test('undefined -> 24x7', () => {
    const c = svc.resolveCalendar(undefined, 'UTC');
    expect(c.type).toBe('24x7');
  });
});
