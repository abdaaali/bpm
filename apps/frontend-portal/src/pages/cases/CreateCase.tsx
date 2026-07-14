import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, TextField, MenuItem, Button,
  FormControl, InputLabel, Select, Alert, Autocomplete, Divider, Chip,
  FormControlLabel, Checkbox,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BugReportIcon from '@mui/icons-material/BugReport';
import BuildIcon from '@mui/icons-material/Build';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SecurityIcon from '@mui/icons-material/Security';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { caseApi, orgApi, mdmApi, datahubApi, processApi } from '../../api/client';
import { DynField, FieldDef, buildInitialValues, isFormComplete } from '../process-studio/startFormHelpers';
import BackButton from '../../components/BackButton';

// Case types that dispatch a team to a site → travel-aware Hybrid SLA applies.
const FIELD_TYPES = new Set(['fault', 'incident', 'theft', 'asset_movement', 'convoy', 'pdt']);

// Case type → the process whose start (intake) form drives structured capture.
const TYPE_SLUG: Record<string, string> = {
  incident: 'incident_management', fault: 'fault_management',
  change: 'change_management', request: 'purchase_request',
};

// ITIL priority matrix: impact (row) × urgency (col) → priority
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  critical: { critical: 'critical', high: 'critical', medium: 'high',   low: 'medium' },
  high:     { critical: 'critical', high: 'high',     medium: 'medium', low: 'low'    },
  medium:   { critical: 'high',     high: 'medium',   medium: 'low',    low: 'low'    },
  low:      { critical: 'medium',   high: 'low',      medium: 'low',    low: 'low'    },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#1976d2', low: '#388e3c',
};

const TYPE_CONFIGS = [
  // ── Service Operations ──
  { type: 'incident', label: 'Incident', group: 'Service Operations',
    description: 'Unplanned service interruption or degradation',
    Icon: BugReportIcon, color: '#d32f2f' },
  { type: 'fault', label: 'Fault', group: 'Service Operations',
    description: 'Technical failure detected via alarms or field observation',
    Icon: ReportProblemIcon, color: '#e65100' },
  { type: 'problem', label: 'Problem', group: 'Service Operations',
    description: 'Root cause investigation for recurring issues',
    Icon: BuildIcon, color: '#f57c00' },
  { type: 'pdt', label: 'Performance Degradation', group: 'Service Operations',
    description: 'KPI deterioration without a direct outage',
    Icon: TrendingDownIcon, color: '#00897b' },
  // ── IT Service Management ──
  { type: 'change', label: 'Change Request', group: 'IT Service Management',
    description: 'Planned modification to infrastructure or services',
    Icon: ChangeCircleIcon, color: '#1976d2' },
  { type: 'request', label: 'Service Request', group: 'IT Service Management',
    description: 'Standard service, access, or information request',
    Icon: HelpOutlineIcon, color: '#388e3c' },
  { type: 'alarm', label: 'Alarm', group: 'IT Service Management',
    description: 'Alert escalated from automated monitoring',
    Icon: NotificationsActiveIcon, color: '#7b1fa2' },
  // ── Security Operations ──
  { type: 'theft', label: 'Theft Case', group: 'Security Operations',
    description: 'Theft reporting, investigation and recovery',
    Icon: SecurityIcon, color: '#c62828' },
  { type: 'security_audit', label: 'Security Audit', group: 'Security Operations',
    description: 'Planned security-control audit and findings',
    Icon: FactCheckIcon, color: '#5e35b1' },
  // ── Field & Logistics ──
  { type: 'asset_movement', label: 'Asset Movement', group: 'Field & Logistics',
    description: 'Move equipment between sites, warehouses or repair',
    Icon: LocalShippingIcon, color: '#1565c0' },
  { type: 'convoy', label: 'Convoy', group: 'Field & Logistics',
    description: 'Secure escorted movement of assets or personnel',
    Icon: AltRouteIcon, color: '#37474f' },
  { type: 'spare_part', label: 'Spare-Part Request', group: 'Field & Logistics',
    description: 'Spare-part request and fulfilment',
    Icon: Inventory2Icon, color: '#6d4c41' },
];

const TYPE_GROUPS = ['Service Operations', 'IT Service Management', 'Security Operations', 'Field & Logistics'];

const LEVELS = ['critical', 'high', 'medium', 'low'];

export default function CreateCase() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', description: '', category: '', subcategory: '',
    impact: 'medium', urgency: 'medium',
    change_type: '', risk_level: '',
    implementation_plan: '', backout_plan: '',
    planned_start_at: '', planned_end_at: '',
    catalog_item: '',
    known_error: false, workaround: '',
    assigned_team_id: '', assignee_id: '',
  });
  const [selectedHost, setSelectedHost] = useState<any>(null);
  const [hostSearch, setHostSearch] = useState('');
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [error, setError] = useState('');

  const calcPriority = PRIORITY_MATRIX[form.impact]?.[form.urgency] || 'low';

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setBool = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.checked }));

  const { data: orgData } = useQuery(
    'org-units-create', () => orgApi.getOrgUnits(1, 200),
    { enabled: !!selectedType },
  );
  // Only leaf "team" org units are valid assignment targets — Team Queue
  // matching is an exact org_unit_id match (case.service.ts getMyWork), so
  // assigning to a division/department/section orphans the case: nobody's
  // queue would ever match it.
  const orgUnits: any[] = (orgData?.data || []).filter((ou: any) => ou.type === 'team');

  const { data: usersData } = useQuery(
    ['users-assignee-create', assigneeSearch, form.assigned_team_id],
    // Scoped to the selected team once one is picked, same as CaseDetail's
    // Reassign dialog — narrows to that team's members instead of a blind
    // org-wide search.
    () => orgApi.getUsers(1, 50, { ...(assigneeSearch ? { search: assigneeSearch } : {}), ...(form.assigned_team_id ? { orgUnitId: form.assigned_team_id } : {}) }),
    { enabled: !!selectedType },
  );
  const userOptions: any[] = usersData?.data || [];

  const { data: mdmData } = useQuery(
    ['mdm-search-create', hostSearch],
    () => mdmApi.list({ search: hostSearch || undefined }, 1, 20),
    { enabled: !!selectedType, keepPreviousData: true },
  );
  const mdmOptions: any[] = mdmData?.data || [];

  const { data: mdmFilterOpts } = useQuery(
    'mdm-filter-opts-create', () => mdmApi.filterOptions(),
    { enabled: !!selectedType, staleTime: 60_000 },
  );
  const categoryOptions: string[] = mdmFilterOpts?.technology_domains || [];

  // DataHub sites — only relevant for field-dispatched case types.
  const isFieldType = !!selectedType && FIELD_TYPES.has(selectedType);
  const { data: sitesData } = useQuery(
    'datahub-sites-create', () => datahubApi.listSites(),
    { enabled: isFieldType, staleTime: 60_000 },
  );
  const siteOptions: any[] = sitesData || [];

  // Live travel-aware SLA preview for the chosen site + priority.
  const { data: slaPreview } = useQuery(
    ['datahub-sla-preview', selectedSite?.id, selectedType, calcPriority],
    () => datahubApi.slaPreview(selectedSite.id, selectedType!, calcPriority),
    { enabled: isFieldType && !!selectedSite },
  );

  // Process intake (start) form — authored on the process StartEvent in BPMN.
  const startSlug = selectedType ? TYPE_SLUG[selectedType] : undefined;
  const { data: startForm } = useQuery(
    ['start-form', startSlug],
    () => processApi.getStartForm(startSlug!),
    { enabled: !!startSlug, retry: false, staleTime: 60_000 },
  );
  const intakeFields: FieldDef[] = startForm?.fields || [];
  const [intake, setIntake] = useState<Record<string, string>>({});
  // Re-seed defaults whenever the field set changes (type switch / form load).
  useEffect(() => { setIntake(buildInitialValues(intakeFields)); }, [startForm?.slug, intakeFields.length]);
  const intakeComplete = isFormComplete(intakeFields, intake);

  const mutation = useMutation(
    () => {
      const context: Record<string, any> = {};
      if (selectedHost) {
        context.affectedHostId = selectedHost.id;
        context.affectedHostName = selectedHost.host_name;
        if (selectedHost.assignment_group) context.assignmentGroup = selectedHost.assignment_group;
        if (selectedHost.sla_class)        context.slaClass = selectedHost.sla_class;
        if (selectedHost.region)           context.region = selectedHost.region;
        if (selectedHost.cluster)          context.cluster = selectedHost.cluster;
      }
      if (selectedSite) {
        context.affectedSiteId = selectedSite.id;
        context.siteCode = selectedSite.site_code;
      }
      // Structured intake values → case context (and on to process variables).
      intakeFields.forEach(f => {
        const v = intake[f.key];
        if (v !== undefined && v !== '') context[f.key] = f.type === 'checkbox' ? v === 'true' : v;
      });
      return caseApi.create({
        type: selectedType,
        affected_site_id: selectedSite?.id || undefined,
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        subcategory: form.subcategory || undefined,
        impact: form.impact,
        urgency: form.urgency,
        priority: calcPriority,
        assignee_id: form.assignee_id || undefined,
        assigned_team_id: form.assigned_team_id || undefined,
        context: Object.keys(context).length ? context : undefined,
        // change
        ...(selectedType === 'change' ? {
          change_type: form.change_type || undefined,
          risk_level: form.risk_level || undefined,
          implementation_plan: form.implementation_plan || undefined,
          backout_plan: form.backout_plan || undefined,
          planned_start_at: form.planned_start_at || undefined,
          planned_end_at: form.planned_end_at || undefined,
        } : {}),
        // problem
        ...(selectedType === 'problem' ? {
          known_error: form.known_error,
          workaround: form.workaround || undefined,
        } : {}),
        // request
        ...(selectedType === 'request' ? {
          catalog_item: form.catalog_item || undefined,
        } : {}),
      });
    },
    {
      onSuccess: (data: any) => { qc.invalidateQueries('cases'); navigate(`/cases/${data.id}`); },
      onError: (e: any) => setError(e.response?.data?.message || e.message),
    },
  );

  // ── Screen 1: Type selection ────────────────────────────────────────────
  if (!selectedType) {
    return (
      <Box>
        <BackButton to="/home" label="Back to Home" sx={{ mb: 2 }} />
        <Typography variant="h4" mb={1}>Create New Case</Typography>
        <Typography variant="body2" color="text.secondary" mb={4}>
          Select the case type to continue
        </Typography>
        {TYPE_GROUPS.map(groupName => (
          <Box key={groupName} sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={700}>{groupName}</Typography>
            <Grid container spacing={2} sx={{ mt: 0 }}>
              {TYPE_CONFIGS.filter(t => t.group === groupName).map(({ type, label, description, Icon, color }) => (
                <Grid item xs={12} sm={6} md={3} key={type}>
                  <Card
                    sx={{
                      cursor: 'pointer', border: '2px solid transparent', height: '100%',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: color, boxShadow: 4 },
                    }}
                    onClick={() => setSelectedType(type)}
                  >
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, p: 2.5 }}>
                      <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: (t) => alpha(color, t.palette.mode === 'dark' ? 0.24 : 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon sx={{ fontSize: 24, color }} />
                      </Box>
                      <Typography variant="subtitle1" fontWeight={600} textAlign="center">{label}</Typography>
                      <Typography variant="caption" color="text.secondary" textAlign="center">{description}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Box>
    );
  }

  // ── Screen 2: Type-specific form ─────────────────────────────────────────
  const cfg = TYPE_CONFIGS.find(t => t.type === selectedType)!;
  const TypeIcon = cfg.Icon;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => setSelectedType(null)} sx={{ mb: 2 }}>
        Change Type
      </Button>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: (t) => alpha(cfg.color, t.palette.mode === 'dark' ? 0.24 : 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TypeIcon sx={{ color: cfg.color }} />
        </Box>
        <Typography variant="h4">New {cfg.label}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* ── Left column ── */}
        <Grid item xs={12} md={8}>

          {/* Basic Information */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>Basic Information</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth required label="Short Description"
                    placeholder="Briefly describe the issue or request"
                    value={form.title} onChange={set('title')} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth multiline rows={4} label="Description"
                    placeholder="Provide full details, steps to reproduce, or business justification…"
                    value={form.description} onChange={set('description')} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Classification */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>Classification</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Autocomplete freeSolo options={categoryOptions}
                    value={form.category || ''} inputValue={form.category || ''}
                    onInputChange={(_, v) => setForm(f => ({ ...f, category: v }))}
                    onChange={(_, v) => { if (typeof v === 'string') setForm(f => ({ ...f, category: v })); }}
                    renderInput={(params) => <TextField {...params} label="Category" fullWidth />}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Subcategory" value={form.subcategory} onChange={set('subcategory')} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Impact & Urgency → Priority Matrix */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={0.5}>Impact &amp; Urgency</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Priority is calculated automatically from Impact × Urgency.
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={5}>
                  <FormControl fullWidth>
                    <InputLabel>Impact</InputLabel>
                    <Select value={form.impact} label="Impact" onChange={set('impact')}>
                      {LEVELS.map(v => <MenuItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={5}>
                  <FormControl fullWidth>
                    <InputLabel>Urgency</InputLabel>
                    <Select value={form.urgency} label="Urgency" onChange={set('urgency')}>
                      {LEVELS.map(v => <MenuItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={2}>
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                      Priority
                    </Typography>
                    <Chip
                      label={calcPriority.toUpperCase()}
                      sx={{ bgcolor: PRIORITY_COLORS[calcPriority], color: 'white', fontWeight: 700, width: '100%' }}
                    />
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Process intake (start) form — authored on the BPMN StartEvent */}
          {intakeFields.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={0.5}>Intake Details</Typography>
                <Typography variant="caption" color="text.secondary" mb={2} display="block">
                  Structured information for the {cfg.label.toLowerCase()} process — captured here and passed to the workflow.
                </Typography>
                <Grid container spacing={2}>
                  {intakeFields.map(f => (
                    <Grid item xs={12} sm={f.type === 'textarea' ? 12 : 6} key={f.key}>
                      <DynField field={f} value={intake[f.key] ?? ''}
                        onChange={v => setIntake(prev => ({ ...prev, [f.key]: v }))} />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Affected CI / Host */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>Affected Configuration Item</Typography>
              <Autocomplete
                options={mdmOptions}
                getOptionLabel={(h: any) => h.host_name || ''}
                value={selectedHost}
                onChange={(_, host) => {
                  setSelectedHost(host);
                  if (host && !form.category && host.technology_domain) {
                    setForm(f => ({ ...f, category: host.technology_domain }));
                  }
                }}
                onInputChange={(_, v) => setHostSearch(v)}
                noOptionsText="No hosts found"
                renderOption={(props, h) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body2">{h.host_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[h.region, h.technology_domain, h.site_id].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Host / CI (optional)" placeholder="Search by hostname or site ID…" />
                )}
              />
              {selectedHost && (
                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(40,86,201,0.14)' : '#e3f2fd', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                  <Typography variant="caption" color="primary" fontWeight={700}>
                    Auto-filled from: {selectedHost.host_name}
                  </Typography>
                  <Box display="grid" gridTemplateColumns="auto 1fr" columnGap={2} rowGap={0.3} mt={0.5}>
                    {selectedHost.assignment_group && <>
                      <Typography variant="caption" color="text.secondary">Assignment Group</Typography>
                      <Typography variant="caption">{selectedHost.assignment_group}</Typography>
                    </>}
                    {selectedHost.sla_class && <>
                      <Typography variant="caption" color="text.secondary">SLA Class</Typography>
                      <Typography variant="caption">{selectedHost.sla_class}</Typography>
                    </>}
                    {selectedHost.region && <>
                      <Typography variant="caption" color="text.secondary">Region</Typography>
                      <Typography variant="caption">{selectedHost.region}</Typography>
                    </>}
                    {selectedHost.oncall_group && <>
                      <Typography variant="caption" color="text.secondary">On-Call Group</Typography>
                      <Typography variant="caption">{selectedHost.oncall_group}</Typography>
                    </>}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Affected Site + travel-aware Hybrid SLA (field-dispatched types only) */}
          {isFieldType && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={0.5}>Affected Site</Typography>
                <Typography variant="caption" color="text.secondary" mb={2} display="block">
                  Selecting a site computes a travel-aware SLA — remote / high-risk sites get a larger travel allowance.
                </Typography>
                <Autocomplete
                  options={siteOptions}
                  getOptionLabel={(s: any) => s.site_code ? `${s.site_code} — ${s.name}` : ''}
                  value={selectedSite}
                  onChange={(_, s) => setSelectedSite(s)}
                  noOptionsText="No sites found"
                  renderOption={(props, s) => (
                    <Box component="li" {...props}>
                      <Box>
                        <Typography variant="body2">{s.site_code} — {s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[s.access_class, s.region, s.support_center].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Site (optional)" placeholder="Search by site code or name…" />
                  )}
                />
                {selectedSite && slaPreview?.breakdown && (() => {
                  const bd = slaPreview.breakdown; const tv = bd.travel || {};
                  const due = slaPreview.sla?.sla_due_at ? new Date(slaPreview.sla.sla_due_at) : null;
                  return (
                    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(181,118,15,0.14)' : '#fff3e0', borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
                      <Typography variant="caption" color="warning.dark" fontWeight={700}>
                        Hybrid SLA preview · {calcPriority} {selectedType}
                        {tv.capped && <Chip size="small" color="warning" label="travel capped" sx={{ ml: 1, height: 18 }} />}
                      </Typography>
                      <Box display="grid" gridTemplateColumns="auto 1fr" columnGap={2} rowGap={0.3} mt={0.5}>
                        <Typography variant="caption" color="text.secondary">Response</Typography>
                        <Typography variant="caption">{bd.fixed_minutes?.response} min</Typography>
                        <Typography variant="caption" color="text.secondary">Travel allowance</Typography>
                        <Typography variant="caption">
                          {tv.allowance_minutes} min&nbsp;
                          <Typography component="span" variant="caption" color="text.secondary">
                            ({tv.base_minutes}×{tv.road_factor}road×{tv.security_factor}sec×{tv.seasonal_factor}seas + {tv.access_delay_minutes} access{tv.convoy_minutes ? ` + ${tv.convoy_minutes} convoy` : ''})
                          </Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">On-site restore</Typography>
                        <Typography variant="caption">{bd.fixed_minutes?.onsite_restore} min</Typography>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Resolution due</Typography>
                        <Typography variant="caption" fontWeight={700}>
                          {due ? due.toLocaleString() : '—'} ({Math.round((bd.total_minutes || 0) / 6) / 10} h)
                        </Typography>
                      </Box>
                    </Box>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Change-specific */}
          {selectedType === 'change' && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>Change Details</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Change Type</InputLabel>
                      <Select value={form.change_type} label="Change Type" onChange={set('change_type')}>
                        <MenuItem value="">— Select —</MenuItem>
                        <MenuItem value="standard">Standard</MenuItem>
                        <MenuItem value="normal">Normal</MenuItem>
                        <MenuItem value="emergency">Emergency</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Risk Level</InputLabel>
                      <Select value={form.risk_level} label="Risk Level" onChange={set('risk_level')}>
                        <MenuItem value="">— Select —</MenuItem>
                        {LEVELS.map(v => <MenuItem key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="datetime-local" label="Planned Start"
                      InputLabelProps={{ shrink: true }}
                      value={form.planned_start_at} onChange={set('planned_start_at')} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth type="datetime-local" label="Planned End"
                      InputLabelProps={{ shrink: true }}
                      value={form.planned_end_at} onChange={set('planned_end_at')} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth multiline rows={3} label="Implementation Plan"
                      placeholder="Describe the implementation steps…"
                      value={form.implementation_plan} onChange={set('implementation_plan')} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth multiline rows={2} label="Backout / Rollback Plan"
                      placeholder="Describe how to revert the change if needed…"
                      value={form.backout_plan} onChange={set('backout_plan')} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Problem-specific */}
          {selectedType === 'problem' && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>Problem Analysis</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={<Checkbox checked={form.known_error} onChange={setBool('known_error')} />}
                      label="Known Error — root cause has been identified"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth multiline rows={3} label="Workaround"
                      placeholder="Describe any available workaround for affected users…"
                      value={form.workaround} onChange={set('workaround')} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Request-specific */}
          {selectedType === 'request' && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>Request Details</Typography>
                <TextField fullWidth label="Catalog Item / Service Requested"
                  placeholder="e.g. Laptop provisioning, VPN access, Software license…"
                  value={form.catalog_item} onChange={set('catalog_item')} />
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* ── Right sidebar ── */}
        <Grid item xs={12} md={4}>
          {/* Assignment */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>Assignment</Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Assigned Team</InputLabel>
                <Select value={form.assigned_team_id} label="Assigned Team" onChange={set('assigned_team_id')}>
                  <MenuItem value="">— None —</MenuItem>
                  {orgUnits.map((ou: any) => (
                    <MenuItem key={ou.id} value={ou.id}>{ou.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Autocomplete
                options={userOptions}
                getOptionLabel={(u: any) => u.display_name || `${u.first_name} ${u.last_name}`}
                value={userOptions.find((u: any) => u.id === form.assignee_id) || null}
                onChange={(_, u) => setForm(f => ({ ...f, assignee_id: u?.id || '' }))}
                // Ignore MUI's programmatic 'reset'/'clear' input-change events
                // (full "First Last" label after a selection) — feeding those
                // into the search re-queries the backend for the combined
                // name, which it can't match against individual columns, and
                // silently wipes the option list back to empty. See the same
                // fix in CaseDetail.tsx's Reassign dialog.
                onInputChange={(_, v, reason) => { if (reason === 'input') setAssigneeSearch(v); }}
                noOptionsText="No users found"
                renderOption={(props, u) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body2">{u.display_name || `${u.first_name} ${u.last_name}`}</Typography>
                      <Typography variant="caption" color="text.secondary">{u.primary_org_unit || u.email}</Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params}
                    label={form.assigned_team_id ? 'Assignee (this team, optional)' : 'Assignee (optional)'}
                    placeholder="Search by name…" />
                )}
              />
            </CardContent>
          </Card>

          {/* Summary + Submit */}
          <Card sx={{ position: 'sticky', top: 16 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>Summary</Typography>
              <Box display="flex" flexDirection="column" gap={1.5} mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Type</Typography>
                  <Chip label={cfg.label} size="small"
                    sx={{ bgcolor: (t) => alpha(cfg.color, t.palette.mode === 'dark' ? 0.24 : 0.12), color: cfg.color, fontWeight: 600 }} />
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Priority</Typography>
                  <Chip label={calcPriority.toUpperCase()} size="small"
                    sx={{ bgcolor: PRIORITY_COLORS[calcPriority], color: 'white', fontWeight: 700 }} />
                </Box>
                {selectedHost && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Affected CI</Typography>
                    <Typography variant="body2" fontWeight={500}>{selectedHost.host_name}</Typography>
                  </Box>
                )}
                {form.assigned_team_id && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Team</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {orgUnits.find(o => o.id === form.assigned_team_id)?.name || '—'}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Divider sx={{ mb: 2 }} />
              {!intakeComplete && (
                <Typography variant="caption" color="warning.main" display="block" mb={1}>
                  Complete the required intake fields to continue.
                </Typography>
              )}
              <Button fullWidth variant="contained" size="large"
                disabled={!form.title.trim() || !intakeComplete || mutation.isLoading}
                onClick={() => { setError(''); mutation.mutate(); }}>
                {mutation.isLoading ? 'Creating…' : `Create ${cfg.label}`}
              </Button>
              <Button fullWidth sx={{ mt: 1 }} onClick={() => navigate('/cases')}>Cancel</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
