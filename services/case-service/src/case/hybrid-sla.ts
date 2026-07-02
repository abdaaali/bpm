/**
 * Travel-aware Hybrid SLA (Telecom framework §14–15).
 *
 * The fairness problem: a fault at a city BTS and a fault at a relay 4 hours out
 * should NOT carry the same resolution clock. A single fixed SLA either punishes
 * remote teams or lets urban faults run slack.
 *
 * The hybrid model splits the clock into:
 *   • FIXED operational targets — response (acknowledge/dispatch decision) and
 *     on-site restore work — accountable to the team regardless of geography.
 *   • A DataHub-driven TRAVEL ALLOWANCE — derived from the affected site's
 *     distance and road / security / seasonal conditions, plus fixed access and
 *     convoy-assembly delays, capped at an approved maximum.
 *
 * resolution_due = from + response + travel_allowance + on-site_restore
 *
 * Every value used is captured in a `breakdown` snapshot stored on the case, so
 * the SLA can be reproduced and audited even after the site's reference data
 * changes later (framework §17.3 — historical reproducibility).
 *
 * Non-field case types, or cases with no affected site, fall back to the flat
 * C4 SLA (computeCaseSla) so nothing regresses.
 */
import { TARGETS, SLA_CLASS_FACTOR, computeCaseSla, ComputeArgs, ComputedSla, SlaConfig } from './sla';

/** Case types that involve dispatching a team to a physical site. */
export const FIELD_TYPES = new Set(['fault', 'incident', 'theft', 'asset_movement', 'convoy', 'pdt']);

/** Fixed coordination/assembly overhead when a convoy is mandated for the site. */
const CONVOY_ASSEMBLY_MIN = 90;

export interface SiteTravel {
  id: string;
  site_code: string;
  name: string;
  access_class: string;
  support_center: string | null;
  base_travel_minutes: number | string;
  max_travel_minutes: number | string;
  road_factor: number | string;
  security_factor: number | string;
  seasonal_factor: number | string;
  access_delay_minutes: number | string;
  convoy_required: boolean;
  escort_required: boolean;
  sla_class: string | null;
  route_code?: string | null;   // set when a DataHub route-matrix entry refined the travel params
}

export interface HybridResult { sla: ComputedSla; breakdown: any; }

const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * Compute a case SLA, travel-aware when a site is supplied for a field type.
 * Returns the same shape callers already use (`sla`) plus an auditable
 * `breakdown` to persist on the case.
 */
export function computeHybridSla(args: ComputeArgs, site?: SiteTravel | null, config?: SlaConfig): HybridResult {
  const type = args.type || 'incident';
  const priority = args.priority || 'medium';
  const slaClass = args.slaClass || site?.sla_class || undefined;
  const targets = config?.targets || TARGETS;
  const classFactors = config?.classFactors || SLA_CLASS_FACTOR;

  // Fall back to flat SLA for non-field types or when no site is known.
  if (!site || !FIELD_TYPES.has(type)) {
    const flat = computeCaseSla({ ...args, slaClass }, config);
    return {
      sla: flat,
      breakdown: {
        profile: 'flat',
        reason: !site ? 'no affected site' : 'non-field case type',
        sla_class: slaClass || null,
        milestones: {
          response_due_at: flat.response_due_at,
          restore_due_at: flat.restore_due_at,
          resolution_due_at: flat.sla_due_at,
        },
        computed_at: (args.from || new Date()).toISOString(),
      },
    };
  }

  const from = args.from || new Date();
  const t = targets[type]?.[priority] || TARGETS[type]?.[priority] || TARGETS.incident.medium;
  const factor = (slaClass && classFactors[slaClass.toLowerCase()]) || 1;

  // ── Fixed operational components (minutes), scaled by SLA class ──
  const responseMin = Math.round(t.responseHours * 60 * factor);
  // On-site restore = the hands-on work target, EXCLUDING travel.
  const onsiteRestoreMin = Math.round((t.restoreHours ?? t.resolveHours) * 60 * factor);

  // ── DataHub travel allowance (framework §15.4) ──
  const base = num(site.base_travel_minutes);
  const road = num(site.road_factor, 1);
  const security = num(site.security_factor, 1);
  const seasonal = num(site.seasonal_factor, 1);
  const adjustedTravel = Math.round(base * road * security * seasonal);
  const accessMin = num(site.access_delay_minutes);
  const convoyMin = site.convoy_required ? CONVOY_ASSEMBLY_MIN : 0;
  const rawTravel = adjustedTravel + accessMin + convoyMin;
  const maxTravel = num(site.max_travel_minutes, rawTravel) || rawTravel;
  const travelAllowance = Math.min(rawTravel, maxTravel);
  const travelCapped = rawTravel > maxTravel;

  // ── Timeline ──
  const ms = (m: number) => m * 60_000;
  const responseDue = new Date(from.getTime() + ms(responseMin));
  const onsiteDue = new Date(from.getTime() + ms(responseMin + travelAllowance)); // dispatched → arrived
  const restoreDue = new Date(onsiteDue.getTime() + ms(onsiteRestoreMin));
  const resolutionDue = restoreDue; // for field ops, resolution == service restored

  const breakdown = {
    profile: 'hybrid',
    site: {
      id: site.id,
      site_code: site.site_code,
      name: site.name,
      access_class: site.access_class,
      support_center: site.support_center,
      escort_required: site.escort_required,
    },
    sla_class: slaClass || null,
    fixed_minutes: { response: responseMin, onsite_restore: onsiteRestoreMin },
    travel: {
      source: site.route_code ? `route:${site.route_code}` : 'site',
      base_minutes: base,
      road_factor: road,
      security_factor: security,
      seasonal_factor: seasonal,
      adjusted_minutes: adjustedTravel,
      access_delay_minutes: accessMin,
      convoy_minutes: convoyMin,
      allowance_minutes: travelAllowance,
      max_minutes: maxTravel,
      capped: travelCapped,
    },
    milestones: {
      response_due_at: responseDue.toISOString(),
      onsite_due_at: onsiteDue.toISOString(),
      restore_due_at: restoreDue.toISOString(),
      resolution_due_at: resolutionDue.toISOString(),
    },
    total_minutes: responseMin + travelAllowance + onsiteRestoreMin,
    computed_at: from.toISOString(),
  };

  return {
    sla: {
      response_due_at: responseDue.toISOString(),
      restore_due_at: restoreDue.toISOString(),
      sla_due_at: resolutionDue.toISOString(),
      sla_profile: 'hybrid',
    },
    breakdown,
  };
}
