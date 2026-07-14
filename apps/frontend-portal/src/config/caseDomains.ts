/**
 * Case-operations domains — the single source of truth for how case types are
 * grouped into the four scoped apps (Service Operations / IT Service Management /
 * Security Operations / Field & Logistics). Launcher tiles, ModuleNav sub-tabs, and CaseList scoping
 * all derive from this map, so the grouping is changed in exactly one place.
 */
export interface DomainType { key: string; label: string; }
export interface CaseDomain { key: string; label: string; types: DomainType[]; }

export const CASE_DOMAINS: Record<string, CaseDomain> = {
  service: {
    key: 'service',
    label: 'Service Operations',
    types: [
      { key: 'incident', label: 'Incidents' },
      { key: 'fault',    label: 'Faults' },
      { key: 'problem',  label: 'Problems' },
      { key: 'pdt',      label: 'Performance' },
    ],
  },
  itsm: {
    key: 'itsm',
    label: 'IT Service Management',
    types: [
      { key: 'change',  label: 'Changes' },
      { key: 'request', label: 'Service Requests' },
      { key: 'alarm',   label: 'Alarms' },
    ],
  },
  security: {
    key: 'security',
    label: 'Security Operations',
    types: [
      { key: 'theft',          label: 'Theft' },
      { key: 'security_audit', label: 'Security Audits' },
    ],
  },
  field: {
    key: 'field',
    label: 'Field & Logistics',
    types: [
      { key: 'asset_movement', label: 'Asset Movements' },
      { key: 'convoy',         label: 'Convoys' },
      { key: 'spare_part',     label: 'Spare Parts' },
    ],
  },
};

/** Comma-joined type keys for a domain (the "All <domain>" multi-type filter). */
export function typeKeysForDomain(domain: string): string[] {
  return CASE_DOMAINS[domain]?.types.map(t => t.key) || [];
}

/** Which domain a given case type belongs to (for inferring context from ?type=). */
export function domainForType(type?: string | null): string | undefined {
  if (!type) return undefined;
  return Object.values(CASE_DOMAINS).find(d => d.types.some(t => t.key === type))?.key;
}

/** Human label for a single type key (falls back to a prettified key). */
export function labelForType(type?: string | null): string | undefined {
  if (!type) return undefined;
  for (const d of Object.values(CASE_DOMAINS)) {
    const t = d.types.find(x => x.key === type);
    if (t) return t.label;
  }
  return type.replace(/_/g, ' ');
}
