/** Maps monitoring severity strings to BPM priority P1..P5 */

const DEFAULT_MAP: Record<string, string> = {
  critical: 'P1',
  disaster: 'P1',
  high: 'P2',
  average: 'P2',
  warning: 'P3',
  information: 'P4',
  info: 'P4',
  not_classified: 'P5',
  unknown: 'P5',
};

let cachedMap: Record<string, string> = { ...DEFAULT_MAP };

/** Call once at startup to merge PRIORITY_MAPPING_JSON overrides */
export function initPriorityMapper(): void {
  // Always reset to defaults first, then apply env overrides
  cachedMap = { ...DEFAULT_MAP };
  const json = process.env.PRIORITY_MAPPING_JSON;
  if (!json) return;
  try {
    const overrides = JSON.parse(json) as Record<string, string>;
    cachedMap = { ...DEFAULT_MAP, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k.toLowerCase(), v])) };
  } catch {
    // keep defaults
  }
}

export function mapPriority(severity: string): string {
  return cachedMap[severity?.toLowerCase()] ?? 'P5';
}

export function normalizeSeverity(raw: string): string {
  const s = (raw ?? '').toLowerCase().trim();
  const known = ['critical', 'high', 'warning', 'info', 'unknown'];
  if (known.includes(s)) return s;
  // Map Zabbix/Grafana variants
  if (s === 'disaster' || s === 'average') return 'high';
  if (s === 'information' || s === 'not_classified') return 'info';
  return 'unknown';
}
