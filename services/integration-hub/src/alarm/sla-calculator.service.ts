import { Injectable, Logger } from '@nestjs/common';
import { SlaParams, SlaCalculationResult, SlaStatus } from './dto/unified-alarm.dto';

// ─── Calendar definitions ──────────────────────────────────────────────────

export interface CalendarDef {
  type: '24x7' | 'business_hours';
  timezone: string;
  /** 0=Sun 1=Mon…6=Sat */
  workingDays: number[];
  startHour: number;  // inclusive, e.g. 8
  endHour: number;    // exclusive, e.g. 18
  blackouts?: Array<{ start: Date; end: Date; reason?: string }>;
}

const CALENDAR_24x7: CalendarDef = {
  type: '24x7',
  timezone: 'UTC',
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  startHour: 0,
  endHour: 24,
};

const CALENDAR_BUSINESS_DEFAULT: CalendarDef = {
  type: 'business_hours',
  timezone: 'UTC',
  workingDays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
};

// ─── SLA Calculator ───────────────────────────────────────────────────────

@Injectable()
export class SlaCalculatorService {
  private readonly logger = new Logger(SlaCalculatorService.name);

  private staticCalendars: Record<string, CalendarDef> = {};

  /** Optionally load static calendar definitions from SLA_STATIC_CALENDARS_JSON */
  onModuleInit(): void {
    const json = process.env.SLA_STATIC_CALENDARS_JSON;
    if (json) {
      try {
        this.staticCalendars = JSON.parse(json) as Record<string, CalendarDef>;
        this.logger.log(`Loaded ${Object.keys(this.staticCalendars).length} static calendar(s)`);
      } catch (e) {
        this.logger.warn(`SLA_STATIC_CALENDARS_JSON parse error: ${e.message}`);
      }
    }
  }

  /**
   * Compute SLA due times and status for a given alarm.
   * @param slaParams SLA parameters (from MDM or defaults)
   * @param slaStartAt The time from which the SLA clock starts
   * @param isPaused   Whether the SLA is currently paused (e.g. waiting_customer)
   * @param pausedSince If paused, when it was paused (to compute elapsed pause time)
   */
  calculate(
    slaParams: SlaParams,
    slaStartAt: Date,
    isPaused = false,
    pausedSince?: Date,
  ): SlaCalculationResult {
    const now = new Date();
    const failOpen = (process.env.SLA_FAIL_OPEN ?? 'true') === 'true';

    try {
      return this._calculate(slaParams, slaStartAt, isPaused, pausedSince, now);
    } catch (e) {
      this.logger.warn(`SLA calculation failed: ${e.message}`);
      if (failOpen) {
        return { sla_status: 'NOT_APPLICABLE', sla_last_calculated_at: now };
      }
      throw e;
    }
  }

  private _calculate(
    p: SlaParams,
    startAt: Date,
    isPaused: boolean,
    pausedSince: Date | undefined,
    now: Date,
  ): SlaCalculationResult {
    if (!p || (process.env.SLA_ENABLED ?? 'true') !== 'true') {
      return { sla_status: 'NOT_APPLICABLE', sla_last_calculated_at: now };
    }

    // We need at least restore_time_minutes to compute anything meaningful
    if (!p.restore_time_minutes) {
      return { sla_status: 'NOT_APPLICABLE', sla_last_calculated_at: now };
    }

    const tz        = p.sla_timezone ?? process.env.SLA_DEFAULT_TIMEZONE ?? 'UTC';
    const calendar  = this.resolveCalendar(p.sla_calendar_id, tz);
    const travel    = p.travel_time_minutes ?? 0;
    const access    = p.access_time_minutes ?? 0;

    const responseDue = p.response_time_minutes
      ? this.addWorkingTime(startAt, p.response_time_minutes, calendar)
      : undefined;

    const onsiteDue = p.onsite_time_minutes
      ? this.addWorkingTime(startAt, p.onsite_time_minutes + travel + access, calendar)
      : undefined;

    const restoreDue = this.addWorkingTime(
      startAt,
      p.restore_time_minutes + travel + access,
      calendar,
    );

    const breachAt = restoreDue;

    // SLA remaining = working-time seconds between now and breach
    let remainingSeconds: number | undefined;
    if (isPaused) {
      // Paused: remaining is frozen at the point pause was activated
      remainingSeconds = pausedSince
        ? Math.max(0, Math.floor((breachAt.getTime() - pausedSince.getTime()) / 1000))
        : undefined;
    } else {
      remainingSeconds = Math.floor((breachAt.getTime() - now.getTime()) / 1000);
    }

    const status = this.deriveStatus(
      now,
      breachAt,
      isPaused,
      remainingSeconds,
      p.restore_time_minutes + travel + access,
    );

    return {
      response_due_at:  responseDue,
      onsite_due_at:    onsiteDue,
      restore_due_at:   restoreDue,
      sla_breach_at:    breachAt,
      sla_remaining_seconds: remainingSeconds,
      sla_status: status,
      sla_last_calculated_at: now,
    };
  }

  private deriveStatus(
    now: Date,
    breachAt: Date,
    isPaused: boolean,
    remainingSeconds: number | undefined,
    totalMinutes: number,
  ): SlaStatus {
    if (isPaused) return 'PAUSED';
    if (now >= breachAt) return 'BREACHED';

    const thresholdPct = parseInt(process.env.SLA_AT_RISK_THRESHOLD_PERCENT ?? '20', 10);
    const totalSeconds = totalMinutes * 60;
    const atRiskThresholdSeconds = totalSeconds * (thresholdPct / 100);

    if (remainingSeconds !== undefined && remainingSeconds <= atRiskThresholdSeconds) {
      return 'AT_RISK';
    }
    return 'ON_TRACK';
  }

  /**
   * Add N working-time minutes to startDate according to the calendar.
   * For 24x7: simple arithmetic.
   * For business_hours: skips non-working hours/days and blackout windows.
   */
  addWorkingTime(startDate: Date, minutes: number, calendar: CalendarDef): Date {
    if (minutes <= 0) return new Date(startDate.getTime());

    if (calendar.type === '24x7' && (!calendar.blackouts || calendar.blackouts.length === 0)) {
      return new Date(startDate.getTime() + minutes * 60_000);
    }

    // Business hours mode
    let cursor = new Date(startDate.getTime());
    // Advance to working time if we're outside working hours
    cursor = this.advanceToWorkingTime(cursor, calendar);

    let remaining = minutes;
    const MAX_ITERATIONS = 10_000; // safety guard (handles up to ~3 months)
    let iter = 0;

    while (remaining > 0 && iter++ < MAX_ITERATIONS) {
      if (this.isInBlackout(cursor, calendar)) {
        // Skip to end of blackout
        const blackoutEnd = this.getBlackoutEnd(cursor, calendar);
        cursor = this.advanceToWorkingTime(blackoutEnd, calendar);
        continue;
      }

      // Minutes remaining in current working block
      const blockEnd = this.getWorkBlockEnd(cursor, calendar);
      const blockMinutes = Math.max(0, Math.floor((blockEnd.getTime() - cursor.getTime()) / 60_000));

      if (blockMinutes >= remaining) {
        cursor = new Date(cursor.getTime() + remaining * 60_000);
        remaining = 0;
      } else {
        remaining -= blockMinutes;
        cursor = this.advanceToWorkingTime(blockEnd, calendar);
      }
    }

    return cursor;
  }

  /** Advance cursor to the next working moment (skipping weekends, off-hours, blackouts) */
  private advanceToWorkingTime(date: Date, cal: CalendarDef): Date {
    let cursor = new Date(date.getTime());
    const MAX = 10_000;
    let i = 0;

    while (i++ < MAX) {
      const ld = this.getLocalParts(cursor, cal.timezone);

      // Check working day
      if (!cal.workingDays.includes(ld.dayOfWeek)) {
        // Advance to start of next day
        cursor = this.startOfNextDay(cursor, cal.timezone);
        continue;
      }

      // Check working hours
      const h = ld.hour + ld.minute / 60;
      if (h < cal.startHour) {
        cursor = this.setLocalHour(cursor, cal.startHour, 0, cal.timezone);
        continue;
      }
      if (h >= cal.endHour) {
        cursor = this.startOfNextDay(cursor, cal.timezone);
        continue;
      }

      // Check blackouts
      if (this.isInBlackout(cursor, cal)) {
        const bo = this.getBlackoutEnd(cursor, cal);
        cursor = new Date(bo.getTime());
        continue;
      }

      return cursor;
    }

    return cursor; // fallback
  }

  /** End of current working block (either end of working day or start of next blackout) */
  private getWorkBlockEnd(cursor: Date, cal: CalendarDef): Date {
    const eod = this.setLocalHour(cursor, cal.endHour, 0, cal.timezone);
    // Check if any blackout starts before end of day
    for (const bo of cal.blackouts ?? []) {
      if (bo.start > cursor && bo.start < eod) {
        return bo.start;
      }
    }
    return eod;
  }

  private isInBlackout(date: Date, cal: CalendarDef): boolean {
    return (cal.blackouts ?? []).some(bo => date >= bo.start && date < bo.end);
  }

  private getBlackoutEnd(date: Date, cal: CalendarDef): Date {
    for (const bo of cal.blackouts ?? []) {
      if (date >= bo.start && date < bo.end) return bo.end;
    }
    return date;
  }

  // ─── Timezone helpers using built-in Intl API ─────────────────────────────

  private getLocalParts(date: Date, tz: string): { hour: number; minute: number; dayOfWeek: number } {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false,
      }).formatToParts(date);
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const hourRaw = parseInt(get('hour'), 10);
      const hour = hourRaw === 24 ? 0 : hourRaw;
      return { hour, minute: parseInt(get('minute'), 10), dayOfWeek: weekdayMap[get('weekday')] ?? 0 };
    } catch {
      // Fallback to UTC
      return { hour: date.getUTCHours(), minute: date.getUTCMinutes(), dayOfWeek: date.getUTCDay() };
    }
  }

  /** Set a specific hour/minute in the given timezone (returns a new Date in UTC) */
  private setLocalHour(date: Date, hour: number, minute: number, tz: string): Date {
    try {
      // Build a string representing the target local time and parse it
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(date); // YYYY-MM-DD
      const target = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
      // The above is parsed as local time; we need UTC equivalent
      const offset = this.tzOffsetMs(date, tz);
      return new Date(target.getTime() - offset);
    } catch {
      const r = new Date(date);
      r.setUTCHours(hour, minute, 0, 0);
      return r;
    }
  }

  private startOfNextDay(date: Date, tz: string): Date {
    return this.setLocalHour(new Date(date.getTime() + 86_400_000), 0, 0, tz);
  }

  /** Compute timezone UTC offset in ms for a given date */
  private tzOffsetMs(date: Date, tz: string): number {
    try {
      const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzStr  = date.toLocaleString('en-US', { timeZone: tz });
      return new Date(utcStr).getTime() - new Date(tzStr).getTime();
    } catch { return 0; }
  }

  // ─── Calendar resolution ─────────────────────────────────────────────────

  resolveCalendar(calendarId: string | undefined, tz: string): CalendarDef {
    if (!calendarId) return { ...CALENDAR_24x7, timezone: tz };

    // Static calendars from env
    if (this.staticCalendars[calendarId]) {
      return { ...this.staticCalendars[calendarId], timezone: tz };
    }

    // Known IDs
    const id = calendarId.toUpperCase();
    if (id === '24X7' || id === '24_7' || id.includes('24x7') || id.includes('24_7')) {
      return { ...CALENDAR_24x7, timezone: tz };
    }

    // Default to business hours for anything that looks like a business calendar
    return { ...CALENDAR_BUSINESS_DEFAULT, timezone: tz };
  }

  /**
   * Parse an MDM service_window object into CalendarDef blackouts array.
   * Used when MDM returns blackout windows alongside a calendar.
   */
  parseBlackouts(serviceWindow: Record<string, any> | undefined): Array<{ start: Date; end: Date; reason?: string }> {
    if (!serviceWindow?.blackouts) return [];
    return (serviceWindow.blackouts as any[]).flatMap(b => {
      try {
        return [{ start: new Date(b.start), end: new Date(b.end), reason: b.reason }];
      } catch { return []; }
    });
  }
}
