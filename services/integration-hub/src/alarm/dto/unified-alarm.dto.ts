export type AlarmSourceSystem = 'Zabbix' | 'Prometheus' | 'Grafana';
export type AlarmStatus = 'FIRING' | 'RESOLVED' | 'OPEN' | 'CLOSED';
export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'PAUSED' | 'NOT_APPLICABLE';

export interface SlaParams {
  sla_profile_id?: string;
  sla_calendar_id?: string;
  sla_timezone?: string;
  /** When SLA clock starts: alarm_first_occurrence | ticket_created | ack_time */
  sla_start_rule?: 'alarm_first_occurrence' | 'ticket_created' | 'ack_time';
  response_time_minutes?: number;
  onsite_time_minutes?: number;
  restore_time_minutes?: number;
  travel_time_minutes?: number;
  access_time_minutes?: number;
  access_restrictions?: string;
  service_window?: Record<string, any>;
  pause_rules?: Array<{ code: string; pause_clock: boolean }>;
  penalty_rules?: Record<string, any>;
}

export interface SlaCalculationResult {
  response_due_at?: Date;
  onsite_due_at?: Date;
  restore_due_at?: Date;
  sla_breach_at?: Date;
  sla_remaining_seconds?: number;
  sla_status: SlaStatus;
  sla_last_calculated_at: Date;
}

export interface MdmEnrichmentResult {
  canonical_site_id?: string;
  canonical_asset_id?: string;
  canonical_service_id?: string;
  region?: string;
  cluster?: string;
  vendor?: string;
  technology_domain?: string;
  assignment_group?: string;
  oncall_group?: string;
  sla_class?: string;
  location_path?: string;
  sla?: SlaParams;
  raw_response?: Record<string, any>;
}

export interface UnifiedAlarm {
  alarm_id: string;
  source_system: AlarmSourceSystem;
  severity: string;
  priority: string;
  title: string;
  description: string;
  site_id: string;
  host_name: string;
  service_name?: string;
  category?: string;
  first_occurrence: string;   // UTC ISO8601
  last_occurrence: string;    // UTC ISO8601
  status: AlarmStatus;
  probable_cause?: string;
  event_count: number;
  correlation_id: string;
  dedup_hash: string;
  raw_payload: Record<string, any>;
  // MDM enrichment (optional at ingestion time)
  canonical_site_id?: string;
  canonical_asset_id?: string;
  canonical_service_id?: string;
  region?: string;
  cluster?: string;
  vendor?: string;
  technology_domain?: string;
  assignment_group?: string;
  oncall_group?: string;
  sla_class?: string;
  location_path?: string;
  enrichment?: Record<string, any>;
  sla_params?: SlaParams;
  // SLA calculated outputs
  response_due_at?: string;
  onsite_due_at?: string;
  restore_due_at?: string;
  sla_breach_at?: string;
  sla_remaining_seconds?: number;
  sla_status?: SlaStatus;
  sla_last_calculated_at?: string;
}
