import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MdmEnrichmentResult, SlaParams } from './dto/unified-alarm.dto';
import { DatabaseService } from '../database/database.service';

interface CacheEntry { value: MdmEnrichmentResult; expiresAt: number; }

@Injectable()
export class MdmEnrichmentService {
  private readonly logger = new Logger(MdmEnrichmentService.name);
  private readonly cache  = new Map<string, CacheEntry>();

  constructor(private readonly db: DatabaseService) {}

  private get enabled()    { return (process.env.MDM_ENRICHMENT_ENABLED ?? 'true') === 'true'; }
  private get baseUrl()    { return (process.env.MDM_BASE_URL ?? '').trim(); }
  private get apiKey()     { return process.env.MDM_API_KEY ?? ''; }
  private get timeoutMs()  { return parseInt(process.env.MDM_TIMEOUT_MS ?? '500', 10); }
  private get cacheTtl()   { return parseInt(process.env.MDM_CACHE_TTL_SECONDS ?? '1800', 10) * 1000; }
  private get failOpen()   { return (process.env.MDM_FAIL_OPEN ?? 'true') === 'true'; }

  /**
   * Attempt MDM enrichment with strict timeout. Returns null on failure if fail-open.
   */
  async enrich(siteId: string, hostName: string, sourceSystem: string, labels: Record<string, any> = {}): Promise<MdmEnrichmentResult | null> {
    if (!this.enabled) return null;

    // If no external MDM configured, fall back to local host registry
    if (!this.baseUrl) {
      return this.enrichFromLocalRegistry(siteId, hostName);
    }

    const cacheKey = `${sourceSystem}:${siteId}:${hostName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const result = await this.callMdm(siteId, hostName, sourceSystem, labels);
      this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + this.cacheTtl });
      return result;
    } catch (e) {
      this.logger.warn(`MDM enrichment failed [${cacheKey}]: ${e.message}`);
      if (this.failOpen) return null;
      throw e;
    }
  }

  private async callMdm(
    siteId: string,
    hostName: string,
    sourceSystem: string,
    labels: Record<string, any>,
  ): Promise<MdmEnrichmentResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    // Try POST /api/mdm/resolve first (most capable)
    try {
      const resp = await axios.post(
        `${this.baseUrl}/api/mdm/resolve`,
        { site_id: siteId, host_name: hostName, source_system: sourceSystem, labels },
        { headers, timeout: this.timeoutMs, validateStatus: () => true },
      );
      if (resp.status < 300) return this.parseMdmResponse(resp.data);
    } catch { /* fall through to GET variants */ }

    // Try GET /api/mdm/resolve/site
    if (siteId) {
      try {
        const resp = await axios.get(
          `${this.baseUrl}/api/mdm/resolve/site`,
          { headers, params: { site_id: siteId }, timeout: this.timeoutMs, validateStatus: () => true },
        );
        if (resp.status < 300) return this.parseMdmResponse(resp.data);
      } catch { /* fall through */ }
    }

    // Try GET /api/mdm/resolve/asset
    if (hostName) {
      const resp = await axios.get(
        `${this.baseUrl}/api/mdm/resolve/asset`,
        { headers, params: { host_name: hostName }, timeout: this.timeoutMs, validateStatus: () => true },
      );
      if (resp.status < 300) return this.parseMdmResponse(resp.data);
    }

    throw new Error('No MDM endpoint returned a successful response');
  }

  private parseMdmResponse(data: any): MdmEnrichmentResult {
    if (!data || typeof data !== 'object') throw new Error('Invalid MDM response');

    const mdmSla = data.sla ?? {};
    const slaParams: SlaParams = {};

    if (mdmSla.sla_profile_id)         slaParams.sla_profile_id      = String(mdmSla.sla_profile_id);
    if (mdmSla.sla_calendar_id)        slaParams.sla_calendar_id     = String(mdmSla.sla_calendar_id);
    if (mdmSla.sla_timezone)           slaParams.sla_timezone        = String(mdmSla.sla_timezone);
    if (mdmSla.sla_start_rule)         slaParams.sla_start_rule      = mdmSla.sla_start_rule;
    if (mdmSla.response_time_minutes != null) slaParams.response_time_minutes = Number(mdmSla.response_time_minutes);
    if (mdmSla.onsite_time_minutes   != null) slaParams.onsite_time_minutes   = Number(mdmSla.onsite_time_minutes);
    if (mdmSla.restore_time_minutes  != null) slaParams.restore_time_minutes  = Number(mdmSla.restore_time_minutes);
    if (mdmSla.travel_time_minutes   != null) slaParams.travel_time_minutes   = Number(mdmSla.travel_time_minutes);
    if (mdmSla.access_time_minutes   != null) slaParams.access_time_minutes   = Number(mdmSla.access_time_minutes);
    if (mdmSla.access_restrictions)    slaParams.access_restrictions  = String(mdmSla.access_restrictions);
    if (mdmSla.service_window)         slaParams.service_window       = mdmSla.service_window;
    if (mdmSla.pause_rules)            slaParams.pause_rules          = mdmSla.pause_rules;
    if (mdmSla.penalty_rules)          slaParams.penalty_rules        = mdmSla.penalty_rules;

    return {
      canonical_site_id:   data.canonical_site_id,
      canonical_asset_id:  data.canonical_asset_id,
      canonical_service_id: data.canonical_service_id,
      region:              data.region,
      cluster:             data.cluster,
      vendor:              data.vendor,
      technology_domain:   data.technology_domain,
      assignment_group:    data.assignment_group,
      oncall_group:        data.oncall_group,
      sla_class:           data.sla_class,
      location_path:       data.location_path,
      sla:                 Object.keys(slaParams).length ? slaParams : undefined,
      raw_response:        data,
    };
  }

  /** Look up local mdm_hosts table as fallback when no external MDM is configured */
  private async enrichFromLocalRegistry(siteId: string, hostName: string): Promise<MdmEnrichmentResult | null> {
    try {
      let row: any = null;
      if (siteId) {
        const r = await this.db.query(
          `SELECT * FROM mdm_hosts WHERE site_id=$1 AND is_active=true ORDER BY host_name LIMIT 1`, [siteId],
        );
        row = r.rows[0] ?? null;
      }
      if (!row && hostName) {
        const r = await this.db.query(
          `SELECT * FROM mdm_hosts WHERE host_name=$1 AND is_active=true LIMIT 1`, [hostName],
        );
        row = r.rows[0] ?? null;
      }
      if (!row) return null;

      const slaParams: SlaParams = {};
      if (row.sla_profile_id)         slaParams.sla_profile_id      = row.sla_profile_id;
      if (row.sla_calendar_id)        slaParams.sla_calendar_id     = row.sla_calendar_id;
      if (row.sla_timezone)           slaParams.sla_timezone        = row.sla_timezone;
      if (row.response_time_minutes)  slaParams.response_time_minutes = row.response_time_minutes;
      if (row.onsite_time_minutes)    slaParams.onsite_time_minutes   = row.onsite_time_minutes;
      if (row.restore_time_minutes)   slaParams.restore_time_minutes  = row.restore_time_minutes;
      if (row.travel_time_minutes)    slaParams.travel_time_minutes   = row.travel_time_minutes;
      if (row.access_time_minutes)    slaParams.access_time_minutes   = row.access_time_minutes;
      if (row.access_restrictions)    slaParams.access_restrictions   = row.access_restrictions;

      return {
        canonical_site_id:  row.canonical_site_id ?? undefined,
        region:             row.region ?? undefined,
        cluster:            row.cluster ?? undefined,
        vendor:             row.vendor ?? undefined,
        technology_domain:  row.technology_domain ?? undefined,
        assignment_group:   row.assignment_group ?? undefined,
        oncall_group:       row.oncall_group ?? undefined,
        sla_class:          row.sla_class ?? undefined,
        location_path:      row.location_path ?? undefined,
        sla:                Object.keys(slaParams).length ? slaParams : undefined,
        raw_response:       row,
      };
    } catch (e) {
      this.logger.warn(`Local registry lookup failed: ${e.message}`);
      return null;
    }
  }

  /** Evict stale cache entries (called periodically) */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }

  get cacheSize(): number { return this.cache.size; }
}
