/**
 * C4 — shared SLA computation for cases (and, in future, tasks).
 *
 * Replaces the old flat SLA_HOURS matrix with profile-aware, tiered targets:
 *   - response_due_at  (acknowledge / first response)
 *   - sla_due_at       (resolve target — the primary breach clock)
 *   - restore_due_at   (service-restore target, for incident/alarm)
 *
 * Profiles:
 *   - '24x7'           — calendar time (default; matches prior behaviour)
 *   - 'business_hours' — counts only Mon–Fri 09:00–17:00 (UTC)
 *
 * Callers may pass an already-computed SLA (e.g. alarm ingestion, which derives
 * MDM-aware response/restore times); case-service honours those instead of
 * recomputing, so a richer upstream SLA is never discarded.
 */

export type SlaProfile = '24x7' | 'business_hours' | 'hybrid';

export interface SlaTargets { responseHours: number; resolveHours: number; restoreHours?: number; }

// ITIL-style response / resolve / restore targets (hours) by type + priority.
export const TARGETS: Record<string, Record<string, SlaTargets>> = {
  incident: { critical: { responseHours: 0.25, resolveHours: 1,  restoreHours: 1 }, high: { responseHours: 0.5, resolveHours: 4,  restoreHours: 4 }, medium: { responseHours: 2,  resolveHours: 8 },  low: { responseHours: 4,  resolveHours: 24 } },
  problem:  { critical: { responseHours: 1,    resolveHours: 4 },                    high: { responseHours: 2,   resolveHours: 8 },                    medium: { responseHours: 8,  resolveHours: 24 }, low: { responseHours: 24, resolveHours: 72 } },
  change:   { critical: { responseHours: 2,    resolveHours: 8 },                    high: { responseHours: 4,   resolveHours: 24 },                   medium: { responseHours: 24, resolveHours: 72 }, low: { responseHours: 48, resolveHours: 168 } },
  request:  { critical: { responseHours: 1,    resolveHours: 4 },                    high: { responseHours: 2,   resolveHours: 8 },                    medium: { responseHours: 8,  resolveHours: 24 }, low: { responseHours: 24, resolveHours: 72 } },
  alarm:    { critical: { responseHours: 0.25, resolveHours: 1,  restoreHours: 1 }, high: { responseHours: 0.5, resolveHours: 2,  restoreHours: 2 }, medium: { responseHours: 1,  resolveHours: 4 },  low: { responseHours: 2,  resolveHours: 8 } },
  // Telecom managed-service processes (defaults; DataHub/contract SLA refines later)
  fault:          { critical: { responseHours: 0.5, resolveHours: 6, restoreHours: 4 }, high: { responseHours: 1, resolveHours: 12, restoreHours: 8 }, medium: { responseHours: 4, resolveHours: 24 }, low: { responseHours: 8, resolveHours: 72 } },
  pdt:            { critical: { responseHours: 2, resolveHours: 24 }, high: { responseHours: 4, resolveHours: 48 }, medium: { responseHours: 8, resolveHours: 72 }, low: { responseHours: 24, resolveHours: 168 } },
  theft:          { critical: { responseHours: 1, resolveHours: 24 }, high: { responseHours: 2, resolveHours: 48 }, medium: { responseHours: 8, resolveHours: 120 }, low: { responseHours: 24, resolveHours: 240 } },
  security_audit: { critical: { responseHours: 24, resolveHours: 168 }, high: { responseHours: 48, resolveHours: 336 }, medium: { responseHours: 72, resolveHours: 504 }, low: { responseHours: 120, resolveHours: 720 } },
  asset_movement: { critical: { responseHours: 2, resolveHours: 24 }, high: { responseHours: 4, resolveHours: 48 }, medium: { responseHours: 8, resolveHours: 72 }, low: { responseHours: 24, resolveHours: 120 } },
  convoy:         { critical: { responseHours: 2, resolveHours: 24 }, high: { responseHours: 4, resolveHours: 48 }, medium: { responseHours: 8, resolveHours: 72 }, low: { responseHours: 24, resolveHours: 120 } },
  spare_part:     { critical: { responseHours: 1, resolveHours: 8 }, high: { responseHours: 2, resolveHours: 24 }, medium: { responseHours: 8, resolveHours: 72 }, low: { responseHours: 24, resolveHours: 168 } },
};

// SLA-class tightens (or loosens) the targets via a multiplier.
export const SLA_CLASS_FACTOR: Record<string, number> = { platinum: 0.5, gold: 0.75, silver: 1, bronze: 1.5 };

const BIZ_START = 9;   // 09:00 UTC
const BIZ_END   = 17;  // 17:00 UTC

function addCalendarHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

// Count only Mon–Fri 09:00–17:00. Fractional hours supported.
function addBusinessHours(from: Date, hours: number): Date {
  const d = new Date(from);
  let remaining = hours;
  let guard = 0;
  while (remaining > 0 && guard++ < 1000) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) { // weekend → next Monday 09:00
      d.setUTCDate(d.getUTCDate() + (day === 6 ? 2 : 1));
      d.setUTCHours(BIZ_START, 0, 0, 0);
      continue;
    }
    const hourOfDay = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (hourOfDay < BIZ_START) { d.setUTCHours(BIZ_START, 0, 0, 0); continue; }
    if (hourOfDay >= BIZ_END)  { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(BIZ_START, 0, 0, 0); continue; }
    const availToday = BIZ_END - hourOfDay;
    if (remaining <= availToday) { d.setTime(d.getTime() + remaining * 3_600_000); remaining = 0; }
    else { remaining -= availToday; d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(BIZ_START, 0, 0, 0); }
  }
  return d;
}

function addHours(from: Date, hours: number, profile: SlaProfile): Date {
  return profile === 'business_hours' ? addBusinessHours(from, hours) : addCalendarHours(from, hours);
}

export interface ComputeArgs { type: string; priority?: string; slaClass?: string; profile?: string; from?: Date; }
export interface ComputedSla { sla_due_at: string; response_due_at: string | null; restore_due_at: string | null; sla_profile: SlaProfile; }

// Configurable SLA: callers may supply tenant-specific targets/class-factors
// (loaded from the DB by SlaConfigService). When omitted, the code defaults
// above are used, so behaviour is unchanged until an admin edits a value.
export interface SlaConfig {
  targets?: Record<string, Record<string, SlaTargets>>;
  classFactors?: Record<string, number>;
}

export function computeCaseSla(args: ComputeArgs, config?: SlaConfig): ComputedSla {
  const type = args.type || 'incident';
  const priority = args.priority || 'medium';
  const profile: SlaProfile = args.profile === 'business_hours' ? 'business_hours' : '24x7';
  const from = args.from || new Date();
  const targets = config?.targets || TARGETS;
  const classFactors = config?.classFactors || SLA_CLASS_FACTOR;
  const t = targets[type]?.[priority] || TARGETS[type]?.[priority] || TARGETS.incident.medium;
  const factor = (args.slaClass && classFactors[args.slaClass.toLowerCase()]) || 1;
  return {
    response_due_at: addHours(from, t.responseHours * factor, profile).toISOString(),
    sla_due_at:      addHours(from, t.resolveHours  * factor, profile).toISOString(),
    restore_due_at:  t.restoreHours != null ? addHours(from, t.restoreHours * factor, profile).toISOString() : null,
    sla_profile:     profile,
  };
}
