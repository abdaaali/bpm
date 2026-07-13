import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  Divider, Alert, MenuItem, Select, FormControl, InputLabel,
  Checkbox, FormControlLabel, Autocomplete, Stack, Stepper, Step,
  StepLabel, Tooltip, Tabs, Tab, IconButton, Paper, Snackbar,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import DevicesIcon from '@mui/icons-material/Devices';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BugReportIcon from '@mui/icons-material/BugReport';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import BuildIcon from '@mui/icons-material/Build';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { caseApi, orgApi, processApi, rcaApi, datahubApi, contractorApi, attachmentApi } from '../../api/client';
import { useAccess } from '../../auth/useAccess';
import PageHeader from '../../components/PageHeader';
import ProcessActionPanel from '../inbox/ProcessActionPanel';
import RcaPanel from './RcaPanel';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../auth/AuthContext';

// ── Status flow per type ─────────────────────────────────────────────────────
const TYPE_FLOW: Record<string, string[]> = {
  incident: ['new', 'open', 'in_progress', 'resolved', 'closed'],
  problem:  ['new', 'open', 'in_progress', 'pending', 'resolved', 'closed'],
  change:   ['new', 'open', 'in_progress', 'pending_approval', 'approved', 'resolved', 'closed'],
  request:  ['new', 'open', 'in_progress', 'pending_approval', 'approved', 'resolved', 'closed'],
  alarm:    ['new', 'open', 'in_progress', 'resolved', 'closed'],
};
const STEP_LABEL: Record<string, string> = {
  new: 'New', open: 'Open', in_progress: 'In Progress',
  pending: 'On Hold', pending_approval: 'Pending Approval',
  approved: 'Approved', resolved: 'Resolved', closed: 'Closed',
};
const OFF_FLOW_STATUSES = ['cancelled', 'rejected'];

// ── Contextual actions per status/type ───────────────────────────────────────
interface CaseAction {
  label: string; targetStatus: string;
  color?: 'primary' | 'error' | 'warning' | 'success' | 'inherit';
  variant?: 'contained' | 'outlined';
  requiresResolution?: boolean;
}
function getActions(c: any): CaseAction[] {
  const { status, type } = c;
  switch (status) {
    case 'new': return [
      { label: 'Accept', targetStatus: 'open', color: 'primary', variant: 'contained' },
      { label: 'Cancel', targetStatus: 'cancelled', color: 'error', variant: 'outlined' },
    ];
    case 'open': return [
      { label: 'Begin Work', targetStatus: 'in_progress', color: 'primary', variant: 'contained' },
      { label: 'Put On Hold', targetStatus: 'pending', variant: 'outlined' },
      { label: 'Cancel', targetStatus: 'cancelled', color: 'error', variant: 'outlined' },
    ];
    case 'in_progress': {
      const acts: CaseAction[] = [];
      if (type === 'change' || type === 'request') {
        acts.push({ label: 'Submit for Approval', targetStatus: 'pending_approval', color: 'primary', variant: 'contained' });
      }
      acts.push({ label: 'Resolve', targetStatus: 'resolved', color: 'success', variant: 'contained', requiresResolution: true });
      acts.push({ label: 'Put On Hold', targetStatus: 'pending', variant: 'outlined' });
      acts.push({ label: 'Cancel', targetStatus: 'cancelled', color: 'error', variant: 'outlined' });
      return acts;
    }
    case 'pending': return [
      { label: 'Resume', targetStatus: 'in_progress', color: 'primary', variant: 'contained' },
      { label: 'Cancel', targetStatus: 'cancelled', color: 'error', variant: 'outlined' },
    ];
    case 'pending_approval': return [];  // approval handled externally
    case 'approved': return [
      { label: 'Begin Implementation', targetStatus: 'in_progress', color: 'primary', variant: 'contained' },
      { label: 'Cancel', targetStatus: 'cancelled', color: 'error', variant: 'outlined' },
    ];
    case 'rejected': return [
      { label: 'Reopen', targetStatus: 'open', color: 'primary', variant: 'outlined' },
    ];
    case 'resolved': return [
      { label: 'Close', targetStatus: 'closed', color: 'success', variant: 'contained' },
      { label: 'Reopen', targetStatus: 'open', variant: 'outlined' },
    ];
    default: return [];
  }
}

// ── Priority / Type chips ────────────────────────────────────────────────────
const PRIORITY_BG: Record<string, string> = { critical: '#d32f2f', high: '#f57c00', medium: '#1976d2', low: '#388e3c' };
const TYPE_ICON: Record<string, React.ElementType> = {
  incident: BugReportIcon, problem: BuildIcon, change: ChangeCircleIcon,
  request: HelpOutlineIcon, alarm: WarningAmberIcon,
};
const TYPE_COLOR: Record<string, string> = {
  incident: '#d32f2f', problem: '#f57c00', change: '#1976d2', request: '#388e3c', alarm: '#7b1fa2',
};

const RESOLUTION_CODES = [
  'Resolved - Fixed', 'Resolved - Workaround', 'Resolved - Not Reproducible',
  'Resolved - Duplicate', 'Resolved - By Design', 'Resolved - No Action Required',
  'Resolved - User Error', 'Resolved - Configuration Change',
];

function TabPanel({ value, index, children }: any) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

// Humanise a minute count, e.g. 195 → "3h 15m".
function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = useAccess();

  const [tab, setTab] = useState(0);
  const [comment, setComment] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);

  // action dialog
  const [actionDialog, setActionDialog] = useState<CaseAction | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [resolutionCode, setResolutionCode] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // reassign dialog
  const [reassignOpen, setReassignOpen] = useState(false);
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');

  // inline edit
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // escalate snackbar
  const [escalateSnack, setEscalateSnack] = useState(false);

  // just-submitted-from-New-Request snackbar
  const [submittedSnack, setSubmittedSnack] = useState(Boolean((location.state as any)?.justSubmitted));
  const submittedBusinessKey = (location.state as any)?.businessKey || '';

  // RCA
  const [rcaCategory, setRcaCategory] = useState('');
  const [rcaSubcategory, setRcaSubcategory] = useState('');
  const [rcaDescription, setRcaDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  // RCA assist (offline ML): similar past cases for the RCA tab
  // Dispatch-to-contractor dialog (real external dispatch)
  const [woOpen, setWoOpen] = useState(false);
  const [dispCompany, setDispCompany] = useState<any>(null);
  const [dispUser, setDispUser] = useState<any>(null);
  const [dispSla, setDispSla] = useState(24);
  const [dispDue, setDispDue] = useState('');
  const [dispInstructions, setDispInstructions] = useState('');
  // Reschedule-request review dialog
  const [rsAssignment, setRsAssignment] = useState<any>(null);
  const [rsDate, setRsDate] = useState('');
  const [rsNote, setRsNote] = useState('');
  // Related-record (case_links) dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<any>(null);
  const [linkType, setLinkType] = useState('related_to');
  const [linkSearch, setLinkSearch] = useState('');
  const [conflictSnack, setConflictSnack] = useState(false);

  const [slaPauseOpen, setSlaPauseOpen] = useState(false);
  const [slaReason, setSlaReason] = useState('waiting_customer');
  const [slaNote, setSlaNote] = useState('');

  const [majorOpen, setMajorOpen] = useState(false);
  const [majorReason, setMajorReason] = useState('');

  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorCode, setVendorCode] = useState('');
  const [vendorReason, setVendorReason] = useState('');
  const [vendorPause, setVendorPause] = useState(true);

  const { data: c, isLoading } = useQuery(['case', id], () => caseApi.get(id!));
  const { data: comments = [] } = useQuery(['case-comments', id], () => caseApi.getComments(id!));
  const { data: attachments = [] } = useQuery(['case-attachments', id], () => attachmentApi.list('case', id!), { enabled: !!id });
  const uploadMut = useMutation((file: File) => attachmentApi.upload('case', id!, file), {
    onSuccess: () => qc.invalidateQueries(['case-attachments', id]),
  });
  const { data: taxonomy = [] } = useQuery('rca-taxonomy', () => rcaApi.taxonomy(), { staleTime: 300_000 });
  // RCA assist (offline, trigram k-NN) — load similar cases when on the RCA tab.
  const { data: rcaSimilar = [] } = useQuery(['rca-similar', id], () => caseApi.rcaSimilar(id!), { enabled: !!id && tab === 1, staleTime: 60_000 });
  const suggestMut = useMutation(() => caseApi.rcaSuggest(id!), {
    onSuccess: (res: any) => {
      setSuggestion(res);
      if (res?.suggestion) { setRcaCategory(res.suggestion.category); setRcaSubcategory(res.suggestion.subcategory || ''); }
    },
  });
  const { data: orgData } = useQuery('org-units-detail', () => orgApi.getOrgUnits(1, 200), { enabled: reassignOpen, keepPreviousData: true });
  const { data: usersData } = useQuery(
    ['users-reassign', assigneeSearch],
    () => orgApi.getUsers(1, 50, assigneeSearch ? { search: assigneeSearch } : {}),
    // keepPreviousData: don't blank the options (and drop the selected value) on
    // every keystroke while searching — that caused the assignee field to flicker.
    { enabled: reassignOpen, keepPreviousData: true },
  );
  // Only leaf "team" org units are valid reassignment targets — see the same
  // comment in CreateCase.tsx.
  const orgUnits: any[] = (orgData?.data || []).filter((ou: any) => ou.type === 'team');
  const userOptions: any[] = usersData?.data || [];

  // Load linked process instance if present
  const { data: procInstance } = useQuery(
    ['proc-instance', c?.process_instance_id],
    () => processApi.getInstance(c!.process_instance_id),
    { enabled: !!c?.process_instance_id },
  );

  // External contractor dispatch for this ticket (real work_order_assignments).
  const { data: assignments = [] } = useQuery(
    ['case-assignments', id],
    // /contractors/assignments returns a paginated envelope {data,page,pageSize}.
    () => contractorApi.getAssignments({ case_id: id }).then((r: any) => r.data?.data ?? []),
    { enabled: !!id },
  );
  const { data: dispCompanies } = useQuery(
    'contractor-companies', () => contractorApi.getCompanies().then((r: any) => r.data),
    { enabled: woOpen, staleTime: 60_000 },
  );
  const companyOptions: any[] = (dispCompanies || []).filter((co: any) => co.active !== false);
  const { data: dispUsers } = useQuery(
    ['contractor-users', dispCompany?.id],
    () => contractorApi.getUsers({ company_id: dispCompany.id }).then((r: any) => r.data),
    { enabled: woOpen && !!dispCompany },
  );
  const contractorUserOptions: any[] = dispUsers || [];

  const dispatchMut = useMutation(
    () => caseApi.dispatchToContractor(id!, {
      company_id: dispCompany?.id,
      user_id: dispUser?.id || null,
      assignment_type: dispUser ? 'technician' : 'company',
      sla_hours: dispSla,
      due_at: dispDue || null,
      instructions: dispInstructions || null,
    }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case-assignments', id]);
        qc.invalidateQueries(['case', id]); // status moves to dispatched_external
        setWoOpen(false); setDispCompany(null); setDispUser(null); setDispSla(24); setDispDue(''); setDispInstructions('');
      },
    },
  );

  const openReschedule = (a: any) => {
    setRsAssignment(a);
    setRsDate(a.reschedule_requested_date ? String(a.reschedule_requested_date).slice(0, 16) : '');
    setRsNote('');
  };
  const rescheduleMut = useMutation(
    ({ decision }: { decision: 'approve' | 'reject' }) => contractorApi.respondReschedule(rsAssignment.id, {
      decision, new_due_at: decision === 'approve' ? (rsDate || null) : null, note: rsNote || null,
    }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case-assignments', id]);
        setRsAssignment(null); setRsDate(''); setRsNote('');
      },
    },
  );

  // Related records (case_links)
  const { data: links = [] } = useQuery(['case-links', id], () => caseApi.getLinks(id!), { enabled: !!id });
  const { data: linkTypeOptions = [] } = useQuery('link-types', () => caseApi.linkTypes(), { staleTime: 600_000 });
  const { data: linkSearchData } = useQuery(
    ['case-link-search', linkSearch],
    () => caseApi.list({ search: linkSearch }, 1, 10),
    { enabled: linkOpen },
  );
  const addLinkMut = useMutation(
    () => caseApi.addLink(id!, { toCaseId: linkTarget?.id, linkType }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case-links', id]);
        setLinkOpen(false); setLinkTarget(null); setLinkType('related_to'); setLinkSearch('');
      },
    },
  );
  const removeLinkMut = useMutation(
    (linkId: string) => caseApi.removeLink(id!, linkId),
    { onSuccess: () => qc.invalidateQueries(['case-links', id]) },
  );

  // ── SLA pause / exclusion ──
  const { data: slaPauses = [] } = useQuery(['case-sla-pauses', id], () => caseApi.getSlaPauses(id!), { enabled: !!id });
  const { data: pauseReasons = [] } = useQuery('sla-pause-reasons', () => caseApi.slaPauseReasons(), { staleTime: 600_000 });
  const reasonLabel = (code: string) => (pauseReasons as any[]).find((r: any) => r.code === code)?.label || code;
  const invalidateSla = () => {
    qc.invalidateQueries(['case', id]);
    qc.invalidateQueries(['case-sla-pauses', id]);
  };
  const pauseMut = useMutation(
    () => caseApi.pauseSla(id!, { reason: slaReason, note: slaNote || undefined }),
    { onSuccess: () => { invalidateSla(); setSlaPauseOpen(false); setSlaNote(''); } },
  );
  const resumeMut = useMutation(
    () => caseApi.resumeSla(id!, {}),
    { onSuccess: invalidateSla },
  );

  useEffect(() => {
    if (c) {
      setRcaCategory(c.root_cause_category || '');
      setRcaSubcategory(c.root_cause_subcategory || '');
      setRcaDescription(c.root_cause_description || '');
      setIsRecurring(c.is_recurring || false);
      setNewAssigneeId(c.assignee_id || '');
      setNewTeamId(c.assigned_team_id || '');
    }
  }, [c?.id]);

  const subcategories: string[] = (taxonomy as any[]).find((t: any) => t.category === rcaCategory)?.subcategories || [];

  // Optimistic-lock conflict (HTTP 409) — surface a reload prompt and refetch.
  const onConflict = (e: any) => {
    if (e?.response?.status === 409) { setConflictSnack(true); qc.invalidateQueries(['case', id]); }
  };

  const transitionMut = useMutation(
    (act: CaseAction) => caseApi.transition(id!, {
      status: act.targetStatus,
      comment: actionComment || undefined,
      resolution_code: act.requiresResolution ? resolutionCode : undefined,
      resolution_notes: act.requiresResolution ? resolutionNotes : undefined,
      expected_version: c?.version,
    }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case', id]);
        qc.invalidateQueries(['case-comments', id]);
        setActionDialog(null); setActionComment(''); setResolutionCode(''); setResolutionNotes('');
      },
      onError: onConflict,
    },
  );

  const addComment = useMutation(
    () => caseApi.addComment(id!, { body: comment, internal: commentInternal }),
    { onSuccess: () => { qc.invalidateQueries(['case-comments', id]); setComment(''); } },
  );

  const assignMut = useMutation(
    () => caseApi.assign(id!, { assigneeId: newAssigneeId || undefined, teamId: newTeamId || undefined }),
    { onSuccess: () => { qc.invalidateQueries(['case', id]); setReassignOpen(false); } },
  );

  const inlineEditMut = useMutation(
    ({ field, value }: { field: string; value: string }) => caseApi.update(id!, { [field]: value, expected_version: c?.version }),
    { onSuccess: () => { qc.invalidateQueries(['case', id]); setEditingField(null); }, onError: onConflict },
  );

  // ── Vendor escalation ──
  const { data: vendorEscalations = [] } = useQuery(['vendor-esc', id], () => caseApi.getVendorEscalations(id!), { enabled: !!id });
  const { data: vendorOptions = [] } = useQuery('datahub-vendors', () => datahubApi.listDomain('vendors'), { enabled: vendorOpen, staleTime: 60_000 });
  const invalidateVendor = () => { qc.invalidateQueries(['vendor-esc', id]); qc.invalidateQueries(['case', id]); qc.invalidateQueries(['case-sla-pauses', id]); };
  const raiseVendorMut = useMutation(
    () => caseApi.raiseVendorEscalation(id!, { vendorCode, reason: vendorReason || undefined, pauseSla: vendorPause }),
    { onSuccess: () => { invalidateVendor(); setVendorOpen(false); setVendorCode(''); setVendorReason(''); } },
  );
  const updateVendorMut = useMutation(
    ({ eid, status }: { eid: string; status: string }) => caseApi.updateVendorEscalation(id!, eid, { status }),
    { onSuccess: invalidateVendor },
  );

  const declareMajorMut = useMutation(
    () => caseApi.declareMajor(id!, { reason: majorReason || undefined, expected_version: c?.version }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case', id]);
        qc.invalidateQueries(['case-comments', id]);
        setMajorOpen(false); setMajorReason('');
      },
      onError: onConflict,
    },
  );

  const escalateMut = useMutation(
    () => caseApi.update(id!, { escalated: true, escalated_at: new Date().toISOString(), expected_version: c?.version }),
    {
      onSuccess: () => {
        qc.invalidateQueries(['case', id]);
        caseApi.addComment(id!, { body: 'Case escalated.', internal: true });
        setEscalateSnack(true);
      },
      onError: onConflict,
    },
  );

  const saveRca = useMutation(
    () => caseApi.update(id!, {
      root_cause_category: rcaCategory || null,
      root_cause_subcategory: rcaSubcategory || null,
      root_cause_description: rcaDescription || null,
      is_recurring: isRecurring,
      expected_version: c?.version,
    }),
    { onSuccess: () => qc.invalidateQueries(['case', id]), onError: onConflict },
  );

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!c) return <Alert severity="error">Case not found</Alert>;

  const flow = TYPE_FLOW[c.type] || TYPE_FLOW.incident;
  const activeStep = flow.indexOf(c.status);
  const isOffFlow = OFF_FLOW_STATUSES.includes(c.status);
  const actions = getActions(c);
  const TypeIconComp = TYPE_ICON[c.type] || BugReportIcon;
  const typeColor = TYPE_COLOR[c.type] || '#1976d2';

  const slaRemaining = c.sla_due_at ? formatDistanceToNow(new Date(c.sla_due_at), { addSuffix: true }) : null;
  const slaOverdue = c.sla_due_at && new Date(c.sla_due_at) < new Date() && !['resolved','closed','cancelled'].includes(c.status);

  return (
    <Box>
      {/* ── Header ── */}
      <PageHeader
        backTo="/cases"
        backLabel="Back to Cases"
        icon={
          <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: typeColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TypeIconComp sx={{ color: typeColor, fontSize: 20 }} />
          </Box>
        }
        title={c.case_number}
        chips={
          <>
            <Chip label={c.type} size="small" sx={{ bgcolor: typeColor + '22', color: typeColor, fontWeight: 600, textTransform: 'capitalize' }} />
            <Chip label={c.priority} size="small" sx={{ bgcolor: PRIORITY_BG[c.priority], color: 'white', fontWeight: 700, textTransform: 'uppercase' }} />
            {c.breached && <Chip label="SLA Breached" size="small" color="error" variant="outlined" />}
            {c.sla_at_risk && !c.breached && <Chip label="SLA At Risk" size="small" color="warning" variant="outlined" />}
            {c.escalated && !c.major_incident && <Chip label="Escalated" size="small" color="warning" />}
            {c.major_incident && <Chip label="MAJOR INCIDENT" size="small" color="error" sx={{ fontWeight: 800 }} />}
            {c.auto_rule && (
              <Tooltip title={`Auto-created by rule "${c.auto_rule}"${c.context?.autoFromCase ? ` from ${c.context.autoFromCase}` : ''}`}>
                <Chip label={`Auto · ${c.context?.autoFromCase || 'rule'}`} size="small" color="info" variant="outlined" />
              </Tooltip>
            )}
          </>
        }
        subtitle={<Typography variant="h6" color="text.secondary">{c.title}</Typography>}
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {!c.major_incident && ['incident', 'fault'].includes(c.type) && !['resolved','closed','cancelled'].includes(c.status) && (
              <Button variant="contained" color="error" size="small"
                startIcon={<WarningAmberIcon />} onClick={() => setMajorOpen(true)}>
                Declare Major Incident
              </Button>
            )}
            {!c.escalated && !c.major_incident && ['in_progress', 'open'].includes(c.status) && c.type === 'incident' && (
              <Button variant="outlined" color="warning" size="small"
                onClick={() => escalateMut.mutate()}>
                Escalate
              </Button>
            )}
            {!['resolved','closed','cancelled'].includes(c.status) && (
              <Button variant="outlined" size="small" startIcon={<PersonIcon />}
                onClick={() => setReassignOpen(true)}>
                Reassign
              </Button>
            )}
            {actions.map(act => (
              <Button key={act.targetStatus}
                variant={act.variant || 'outlined'}
                color={act.color || 'inherit'}
                size="small"
                onClick={() => setActionDialog(act)}>
                {act.label}
              </Button>
            ))}
          </Stack>
        }
      />

      {/* ── Major Incident banner ── */}
      {c.major_incident && (
        <Alert severity="error" icon={<WarningAmberIcon />} sx={{ mb: 3, fontWeight: 600 }}>
          <strong>MAJOR INCIDENT</strong> declared{c.declared_major_at ? ` ${format(new Date(c.declared_major_at), 'dd MMM HH:mm')}` : ''}
          {c.mim_name ? ` — Major Incident Manager: ${c.mim_name}` : ''}. Coordinate via the incident bridge.
        </Alert>
      )}

      {/* ── Status Stepper ── */}
      {!isOffFlow ? (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ py: 2 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {flow.map((s) => (
                <Step key={s}>
                  <StepLabel>{STEP_LABEL[s] || s}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </CardContent>
        </Card>
      ) : (
        <Alert severity={c.status === 'cancelled' ? 'warning' : 'error'} sx={{ mb: 3 }}>
          This case is <strong>{c.status.replace(/_/g,' ')}</strong>.
        </Alert>
      )}

      {/* ── Main content ── */}
      <Grid container spacing={3}>
        {/* ── Left column ── */}
        <Grid item xs={12} md={8}>

          {/* Description */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6">Description</Typography>
                {editingField !== 'description' && (
                  <IconButton size="small" onClick={() => { setEditingField('description'); setEditValue(c.description || ''); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              {editingField === 'description' ? (
                <Box>
                  <TextField fullWidth multiline rows={4} value={editValue} onChange={e => setEditValue(e.target.value)} />
                  <Box display="flex" gap={1} mt={1}>
                    <Button size="small" variant="contained" startIcon={<SaveIcon />}
                      onClick={() => inlineEditMut.mutate({ field: 'description', value: editValue })}>
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditingField(null)}>Cancel</Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {c.description || <span style={{ color: '#9e9e9e' }}>No description provided.</span>}
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Type-specific panels */}
          {c.type === 'change' && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>Change Details</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Change Type</Typography>
                    <Typography fontWeight={500} textTransform="capitalize">{c.change_type || '—'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Risk Level</Typography>
                    <Typography fontWeight={500} textTransform="capitalize">{c.risk_level || '—'}</Typography>
                  </Grid>
                  {c.planned_start_at && (
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Planned Start</Typography>
                      <Typography fontWeight={500}>{format(new Date(c.planned_start_at), 'dd MMM yyyy HH:mm')}</Typography>
                    </Grid>
                  )}
                  {c.planned_end_at && (
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Planned End</Typography>
                      <Typography fontWeight={500}>{format(new Date(c.planned_end_at), 'dd MMM yyyy HH:mm')}</Typography>
                    </Grid>
                  )}
                  {c.implementation_plan && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" mb={0.5}>Implementation Plan</Typography>
                      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f9f9f9' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.implementation_plan}</Typography>
                      </Paper>
                    </Grid>
                  )}
                  {c.backout_plan && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" mb={0.5}>Backout / Rollback Plan</Typography>
                      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f9f9f9' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.backout_plan}</Typography>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          )}

          {c.type === 'problem' && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={2}>Problem Analysis</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Chip
                      label={c.known_error ? 'Known Error — Root cause identified' : 'Root cause under investigation'}
                      color={c.known_error ? 'warning' : 'default'}
                      size="small"
                    />
                  </Grid>
                  {c.workaround && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" mb={0.5}>Workaround</Typography>
                      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fffde7' }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.workaround}</Typography>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          )}

          {c.type === 'request' && c.catalog_item && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" mb={1}>Request Details</Typography>
                <Typography variant="body2" color="text.secondary">Catalog Item</Typography>
                <Typography fontWeight={500}>{c.catalog_item}</Typography>
              </CardContent>
            </Card>
          )}

          {/* Resolution (when resolved/closed) */}
          {(c.status === 'resolved' || c.status === 'closed') && (c.resolution_code || c.resolution_notes) && (
            <Card sx={{ mb: 3, border: '1px solid #a5d6a7' }}>
              <CardContent>
                <Typography variant="h6" color="success.dark" mb={2}>Resolution</Typography>
                {c.resolution_code && (
                  <Box mb={1.5}>
                    <Typography variant="body2" color="text.secondary">Resolution Code</Typography>
                    <Chip label={c.resolution_code} color="success" size="small" sx={{ mt: 0.5 }} />
                  </Box>
                )}
                {c.resolution_notes && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" mb={0.5}>Resolution Notes</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.resolution_notes}</Typography>
                  </Box>
                )}
                {c.resolved_at && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    Resolved {format(new Date(c.resolved_at), 'dd MMM yyyy HH:mm')}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

          {/* Process-backed case: fold the live workflow step inline so the case
              behaves like any normal case — the BPMN diagram/monitor stays a
              designer-only tool, surfaced here only as a discreet link. */}
          {c.process_instance_id && (
            <>
              <ProcessActionPanel
                processInstanceId={c.process_instance_id}
                onChanged={() => { qc.invalidateQueries(['case', id]); qc.invalidateQueries(['proc-instance', c.process_instance_id]); }}
              />
              {can('processes:read') && procInstance && (
                <Box display="flex" justifyContent="flex-end" mb={3} mt={-1}>
                  <Button size="small" endIcon={<OpenInNewIcon />}
                    component={RouterLink} to={`/processes/instances/${procInstance.id}`}>
                    View workflow ({procInstance.definition_name || 'process'})
                  </Button>
                </Box>
              )}
            </>
          )}

          {/* Parent ticket link (when this case is a child / Work Order) */}
          {c.parent_case_id && (
            <Card sx={{ mb: 3 }} variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    {c.case_relationship === 'work_order' ? 'Work Order of parent ticket' : 'Child of parent ticket'}
                  </Typography>
                  <Button size="small" endIcon={<OpenInNewIcon />} component={RouterLink} to={`/cases/${c.parent_case_id}`}>
                    Open parent
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* External contractor dispatch (work_order_assignments) */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6">
                  <Box component="span" display="flex" alignItems="center" gap={1}>
                    <BuildIcon fontSize="small" />Field Dispatch ({(assignments as any[]).length})
                  </Box>
                </Typography>
                <Button variant="contained" size="small" startIcon={<BuildIcon />} onClick={() => setWoOpen(true)}>
                  Dispatch to Contractor
                </Button>
              </Box>
              {(assignments as any[]).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Not dispatched. Assign an external contractor to carry out field work for this ticket — they'll see it in the contractor portal.
                </Typography>
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {(assignments as any[]).map((a: any) => (
                    <Box key={a.id} display="flex" justifyContent="space-between" alignItems="flex-start" py={1} px={1}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{a.company_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.work_order_ref}{a.assigned_user_name ? ` · ${a.assigned_user_name}` : ''}
                          {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ''}
                        </Typography>
                        {a.reschedule_id && (
                          <Box mt={0.75} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Chip size="small" color="warning" variant="outlined"
                              label={`📅 Reschedule → ${new Date(a.reschedule_requested_date).toLocaleDateString()}`} />
                            <Button size="small" variant="outlined" color="warning" onClick={() => openReschedule(a)}>Review</Button>
                          </Box>
                        )}
                      </Box>
                      <Chip size="small" label={String(a.assignment_status).replace(/_/g, ' ')}
                        color={a.assignment_status === 'closed' ? 'success'
                          : a.assignment_status === 'rejected' ? 'error'
                          : a.assignment_status === 'rework_required' ? 'warning' : 'default'} />
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Dispatch to Contractor dialog */}
          <Dialog open={woOpen} onClose={() => setWoOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Dispatch to Contractor</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Assign an external contractor to <strong>{c.case_number}</strong>. The work order appears in their contractor portal to accept and complete.
              </Typography>
              <Autocomplete sx={{ mb: 2 }} options={companyOptions} value={dispCompany}
                onChange={(_, v) => { setDispCompany(v); setDispUser(null); }}
                getOptionLabel={(o: any) => o.company_name || ''}
                isOptionEqualToValue={(o, v) => o.id === v?.id}
                renderInput={(p) => <TextField {...p} size="small" label="External company *" autoFocus />} />
              <Autocomplete sx={{ mb: 2 }} options={contractorUserOptions} value={dispUser} disabled={!dispCompany}
                onChange={(_, v) => setDispUser(v)}
                getOptionLabel={(o: any) => `${o.full_name}${o.role ? ` (${o.role})` : ''}`}
                isOptionEqualToValue={(o, v) => o.id === v?.id}
                renderInput={(p) => <TextField {...p} size="small" label="Technician / supervisor (optional)" />} />
              <Box display="flex" gap={2} mb={2}>
                <TextField size="small" type="number" label="SLA hours" sx={{ width: 120 }}
                  value={dispSla} onChange={e => setDispSla(Number(e.target.value))} />
                <TextField size="small" type="datetime-local" label="Due" sx={{ flex: 1 }}
                  InputLabelProps={{ shrink: true }} value={dispDue} onChange={e => setDispDue(e.target.value)} />
              </Box>
              <TextField fullWidth multiline minRows={2} size="small" label="Instructions"
                value={dispInstructions} onChange={e => setDispInstructions(e.target.value)} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setWoOpen(false)}>Cancel</Button>
              <Button variant="contained" disabled={!dispCompany || dispatchMut.isLoading}
                onClick={() => dispatchMut.mutate()}>
                {dispatchMut.isLoading ? 'Dispatching…' : 'Dispatch'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Reschedule request review dialog */}
          <Dialog open={!!rsAssignment} onClose={() => setRsAssignment(null)} maxWidth="sm" fullWidth>
            <DialogTitle>Reschedule request</DialogTitle>
            <DialogContent dividers>
              {rsAssignment && (
                <>
                  <Typography variant="body2" mb={1}>
                    <strong>{rsAssignment.company_name}</strong> requested a new date for {rsAssignment.work_order_ref}.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Requested: {new Date(rsAssignment.reschedule_requested_date).toLocaleString()}<br />
                    Reason: {rsAssignment.reschedule_reason || '—'}
                  </Typography>
                  <TextField fullWidth size="small" type="datetime-local" label="New due date (on approve)" sx={{ mb: 2 }}
                    InputLabelProps={{ shrink: true }} value={rsDate} onChange={e => setRsDate(e.target.value)} />
                  <TextField fullWidth multiline minRows={2} size="small" label="Note to contractor"
                    value={rsNote} onChange={e => setRsNote(e.target.value)} />
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRsAssignment(null)}>Cancel</Button>
              <Button color="error" disabled={rescheduleMut.isLoading}
                onClick={() => rescheduleMut.mutate({ decision: 'reject' })}>Reject</Button>
              <Button variant="contained" color="success" disabled={!rsDate || rescheduleMut.isLoading}
                onClick={() => rescheduleMut.mutate({ decision: 'approve' })}>Approve</Button>
            </DialogActions>
          </Dialog>

          {/* Related Records (case_links) */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6">
                  <Box component="span" display="flex" alignItems="center" gap={1}>
                    <LinkIcon fontSize="small" />Related Records ({(links as any[]).length})
                  </Box>
                </Typography>
                <Button variant="outlined" size="small" startIcon={<LinkIcon />} onClick={() => setLinkOpen(true)}>
                  Link record
                </Button>
              </Box>
              {(links as any[]).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No related records. Link incidents, problems, asset movements, theft cases, etc.
                </Typography>
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {(links as any[]).map((l: any) => (
                    <Box key={l.id} display="flex" justifyContent="space-between" alignItems="center" py={1} px={1}>
                      <Box display="flex" alignItems="center" gap={1} sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                        onClick={() => navigate(`/cases/${l.case_id}`)}>
                        <Chip size="small" variant="outlined"
                          color={l.direction === 'outgoing' ? 'primary' : 'default'}
                          label={`${l.direction === 'outgoing' ? '→' : '←'} ${String(l.link_type).replace(/_/g, ' ')}`} />
                        <Typography variant="body2" fontWeight={600} color="primary">{l.case_number}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{l.type} · {l.title}</Typography>
                      </Box>
                      <Tooltip title="Remove link">
                        <IconButton size="small" onClick={() => removeLinkMut.mutate(l.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Vendor Escalations */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6">
                  <Box component="span" display="flex" alignItems="center" gap={1}>
                    <BuildIcon fontSize="small" />Vendor Escalations ({(vendorEscalations as any[]).length})
                  </Box>
                </Typography>
                {!['resolved', 'closed', 'cancelled'].includes(c.status) && (
                  <Button variant="outlined" size="small" onClick={() => setVendorOpen(true)}>Escalate to vendor</Button>
                )}
              </Box>
              {(vendorEscalations as any[]).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No vendor escalations.</Typography>
              ) : (
                <Stack divider={<Divider />} spacing={0}>
                  {(vendorEscalations as any[]).map((v: any) => {
                    const overdue = v.vendor_sla_due_at && new Date(v.vendor_sla_due_at) < new Date() && ['open', 'acknowledged'].includes(v.status);
                    return (
                      <Box key={v.id} py={1} px={0.5}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight={600}>{v.vendor_name}</Typography>
                          <Chip size="small" label={v.status}
                            color={v.status === 'resolved' ? 'success' : v.status === 'cancelled' ? 'default' : overdue ? 'error' : 'warning'} sx={{ height: 20 }} />
                        </Box>
                        {v.reason && <Typography variant="caption" color="text.secondary" display="block">{v.reason}</Typography>}
                        <Typography variant="caption" color={overdue ? 'error' : 'text.secondary'}>
                          {v.contact_email || '—'}{v.vendor_sla_due_at ? ` · vendor SLA ${overdue ? 'overdue' : 'due'} ${format(new Date(v.vendor_sla_due_at), 'dd MMM HH:mm')}` : ''}
                          {v.paused_case ? ' · case SLA paused' : ''}
                        </Typography>
                        {['open', 'acknowledged'].includes(v.status) && (
                          <Box display="flex" gap={1} mt={0.5}>
                            {v.status === 'open' && <Button size="small" onClick={() => updateVendorMut.mutate({ eid: v.id, status: 'acknowledged' })}>Acknowledge</Button>}
                            <Button size="small" color="success" onClick={() => updateVendorMut.mutate({ eid: v.id, status: 'resolved' })}>Resolve</Button>
                            <Button size="small" color="inherit" onClick={() => updateVendorMut.mutate({ eid: v.id, status: 'cancelled' })}>Cancel</Button>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Vendor escalation dialog */}
          <Dialog open={vendorOpen} onClose={() => setVendorOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Escalate to vendor</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Vendor</InputLabel>
                <Select value={vendorCode} label="Vendor" onChange={e => setVendorCode(e.target.value)}>
                  {(vendorOptions as any[]).map((v: any) => (
                    <MenuItem key={v.code} value={v.code}>{v.name} {v.data?.slaHours ? `· SLA ${v.data.slaHours}h` : ''}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField size="small" label="Reason" multiline rows={2} value={vendorReason} onChange={e => setVendorReason(e.target.value)} />
              <FormControlLabel control={<Checkbox checked={vendorPause} onChange={e => setVendorPause(e.target.checked)} />}
                label={<Typography variant="body2">Pause case SLA while awaiting vendor</Typography>} />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setVendorOpen(false)}>Cancel</Button>
              <Button variant="contained" disabled={!vendorCode || raiseVendorMut.isLoading} onClick={() => raiseVendorMut.mutate()}>Escalate</Button>
            </DialogActions>
          </Dialog>

          {/* Link record dialog */}
          <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Link a related record</DialogTitle>
            <DialogContent dividers>
              <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                <InputLabel>Relationship</InputLabel>
                <Select value={linkType} label="Relationship" onChange={e => setLinkType(e.target.value)}>
                  {(linkTypeOptions as string[]).map(t => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
                </Select>
              </FormControl>
              <Autocomplete
                options={((linkSearchData as any)?.data || []).filter((x: any) => x.id !== id)}
                getOptionLabel={(o: any) => `${o.case_number} — ${o.title}`}
                value={linkTarget}
                onChange={(_, v) => setLinkTarget(v)}
                // Same guard as the Reassign Autocomplete above: ignore MUI's
                // programmatic 'reset'/'clear' input-change events (fired with
                // the full "CASE-123 — title" label after a selection), which
                // otherwise re-query the backend for that compound string and
                // wipe the option list back to empty.
                onInputChange={(_, v, reason) => { if (reason === 'input') setLinkSearch(v); }}
                renderInput={p => <TextField {...p} size="small" label="Find a case (number or title)" />}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button variant="contained" disabled={!linkTarget || addLinkMut.isLoading} onClick={() => addLinkMut.mutate()}>
                {addLinkMut.isLoading ? 'Linking…' : 'Link'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Tabs: Work Notes | RCA */}
          <Card>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                <Tab label={`Work Notes (${comments.length})`} />
                <Tab label="Root Cause Analysis" />
                <Tab label={`Attachments (${attachments.length})`} />
              </Tabs>
            </Box>

            {/* Work Notes tab */}
            <TabPanel value={tab} index={0}>
              <CardContent>
                {(comments as any[]).map((cm: any) => (
                  <Box key={cm.id} mb={2} p={2} sx={{
                    bgcolor: cm.internal ? '#fffde7' : '#f5f5f5',
                    borderRadius: 2, borderLeft: cm.internal ? '3px solid #f9a825' : '3px solid #e0e0e0',
                  }}>
                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="caption" fontWeight={600}>
                        {cm.author_name || 'System'}
                      </Typography>
                      <Box display="flex" gap={1} alignItems="center">
                        {cm.internal && <Chip label="Internal" size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />}
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(cm.created_at), 'dd MMM yyyy HH:mm')}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2">{cm.body}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 2 }} />
                <TextField fullWidth multiline rows={3}
                  placeholder="Add a note…"
                  value={comment} onChange={e => setComment(e.target.value)} />
                <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={commentInternal} onChange={e => setCommentInternal(e.target.checked)} />}
                    label={<Typography variant="body2">Internal note (not visible to requester)</Typography>}
                  />
                  <Button variant="contained" size="small" disabled={!comment || addComment.isLoading}
                    onClick={() => addComment.mutate()}>
                    Add Note
                  </Button>
                </Box>
              </CardContent>
            </TabPanel>

            {/* RCA tab */}
            <TabPanel value={tab} index={1}>
              <CardContent>
                {/* RCA Assist — offline trigram k-NN (no model, no internet) */}
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f3f6fb', borderRadius: 1, border: '1px solid #e0e7f0' }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle2" fontWeight={700}>RCA Assist <Typography component="span" variant="caption" color="text.secondary">— similar past cases (trigram k-NN)</Typography></Typography>
                    <Button size="small" variant="outlined" disabled={suggestMut.isLoading} onClick={() => suggestMut.mutate()}>
                      {suggestMut.isLoading ? 'Analyzing…' : 'Suggest cause'}
                    </Button>
                  </Box>
                  {suggestion && (suggestion.suggestion
                    ? <Alert severity="info" sx={{ py: 0, mb: 1 }}>
                        Suggested: <strong>{suggestion.suggestion.category}{suggestion.suggestion.subcategory ? ` / ${suggestion.suggestion.subcategory}` : ''}</strong>
                        {' '}<Chip size="small" label={`${Math.round(suggestion.suggestion.confidence * 100)}% confidence`} sx={{ height: 18 }} /> — applied to the fields below.
                      </Alert>
                    : <Alert severity="warning" sx={{ py: 0, mb: 1 }}>No similar tagged cases yet to suggest from.</Alert>)}
                  {(rcaSimilar as any[]).length === 0
                    ? <Typography variant="caption" color="text.secondary">No similar incidents found.</Typography>
                    : (rcaSimilar as any[]).slice(0, 5).map((s: any) => (
                        <Box key={s.id} display="flex" alignItems="center" gap={1} py={0.3} sx={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${s.id}`)}>
                          <Chip size="small" label={`${Math.round(s.similarity * 100)}%`} color="primary" variant="outlined" sx={{ height: 18, minWidth: 44 }} />
                          <Typography variant="body2" fontWeight={600} color="primary">{s.case_number}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>{s.title}</Typography>
                          {s.root_cause_category && <Chip size="small" label={s.root_cause_category} sx={{ height: 18 }} />}
                        </Box>
                      ))}
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Root Cause Category</InputLabel>
                      <Select value={rcaCategory} label="Root Cause Category"
                        onChange={e => { setRcaCategory(e.target.value); setRcaSubcategory(''); }}>
                        <MenuItem value=""><em>— Select —</em></MenuItem>
                        {(taxonomy as any[]).map((t: any) => (
                          <MenuItem key={t.category} value={t.category}>{t.category}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" disabled={!rcaCategory}>
                      <InputLabel>Subcategory</InputLabel>
                      <Select value={rcaSubcategory} label="Subcategory"
                        onChange={e => setRcaSubcategory(e.target.value)}>
                        <MenuItem value=""><em>— Select —</em></MenuItem>
                        {subcategories.map((s: string) => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth multiline rows={2} size="small" label="Root Cause Description"
                      value={rcaDescription} onChange={e => setRcaDescription(e.target.value)} />
                  </Grid>
                  <Grid item xs={12} display="flex" justifyContent="space-between" alignItems="center">
                    <FormControlLabel
                      control={<Checkbox checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />}
                      label="Recurring issue"
                    />
                    <Button variant="contained" size="small" disabled={saveRca.isLoading}
                      onClick={() => saveRca.mutate()}>
                      {saveRca.isLoading ? 'Saving…' : 'Save Root Cause'}
                    </Button>
                  </Grid>
                  {saveRca.isSuccess && (
                    <Grid item xs={12}>
                      <Alert severity="success" sx={{ py: 0 }}>Root cause saved.</Alert>
                    </Grid>
                  )}
                </Grid>
                <RcaPanel caseId={id!} />
              </CardContent>
            </TabPanel>

            {/* Attachments tab */}
            <TabPanel value={tab} index={2}>
              <CardContent>
                <Button component="label" size="small" variant="outlined" disabled={uploadMut.isLoading} sx={{ mb: 2 }}>
                  {uploadMut.isLoading ? 'Uploading…' : 'Upload file'}
                  <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); }} />
                </Button>
                {attachments.length === 0 && <Typography variant="body2" color="text.secondary">No attachments yet.</Typography>}
                {(attachments as any[]).map(a => (
                  <Box key={a.id} display="flex" justifyContent="space-between" alignItems="center" py={1} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box>
                      <Typography variant="body2">{a.filename}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.uploader_name || 'Unknown'} · {format(new Date(a.created_at), 'dd MMM yyyy HH:mm')}
                      </Typography>
                    </Box>
                    <Button size="small" onClick={async () => {
                      const { url } = await attachmentApi.getUrl(a.id);
                      window.open(url, '_blank');
                    }}>
                      Download
                    </Button>
                  </Box>
                ))}
              </CardContent>
            </TabPanel>
          </Card>
        </Grid>

        {/* ── Right sidebar ── */}
        <Grid item xs={12} md={4}>

          {/* Assignment */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                <Typography variant="h6">Assignment</Typography>
                {!['resolved','closed','cancelled'].includes(c.status) && (
                  <Button size="small" onClick={() => setReassignOpen(true)}>Reassign</Button>
                )}
              </Box>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <PersonIcon fontSize="small" color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">Assignee</Typography>
                  <Typography fontWeight={500}>{c.assignee_name || 'Unassigned'}</Typography>
                </Box>
              </Box>
              <Box display="flex" alignItems="center" gap={1}>
                <GroupIcon fontSize="small" color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">Team</Typography>
                  <Typography fontWeight={500}>{c.team_name || '—'}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Case Details */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={1.5}>Details</Typography>
              <Box display="flex" flexDirection="column" gap={1.2}>
                {[
                  ['Requester',  c.requester_name],
                  ['Category',   c.category || '—'],
                  ['Subcategory',c.subcategory || '—'],
                  ['Impact',     c.impact],
                  ['Urgency',    c.urgency],
                ].map(([label, value]) => (
                  <Box key={label} display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={500} textTransform="capitalize">{value}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Affected CI */}
          {c.context?.affectedHostName && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                  <DevicesIcon fontSize="small" color="action" />
                  <Typography variant="h6">Affected CI</Typography>
                </Box>
                <Typography fontWeight={600} mb={1}>{c.context.affectedHostName}</Typography>
                <Box display="flex" flexDirection="column" gap={0.8}>
                  {c.context.region && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Region</Typography>
                      <Typography variant="body2">{c.context.region}</Typography>
                    </Box>
                  )}
                  {c.context.assignmentGroup && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Assignment Group</Typography>
                      <Typography variant="body2">{c.context.assignmentGroup}</Typography>
                    </Box>
                  )}
                  {c.context.slaClass && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">SLA Class</Typography>
                      <Typography variant="body2">{c.context.slaClass}</Typography>
                    </Box>
                  )}
                  {c.context.cluster && (
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Cluster</Typography>
                      <Typography variant="body2">{c.context.cluster}</Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* SLA & Dates */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <ScheduleIcon fontSize="small" color="action" />
                <Typography variant="h6">SLA &amp; Dates</Typography>
              </Box>
              <Box display="flex" flexDirection="column" gap={1}>
                {c.sla_due_at && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">SLA Due</Typography>
                    <Typography fontWeight={500}
                      color={c.sla_paused ? 'warning.main' : (slaOverdue ? 'error.main' : (c.sla_at_risk ? 'warning.main' : 'text.primary'))}>
                      {format(new Date(c.sla_due_at), 'dd MMM yyyy HH:mm')}
                    </Typography>
                    {c.sla_paused ? (
                      <Typography variant="caption" color="warning.main" fontWeight={600}>
                        ⏸ Clock paused — {reasonLabel(c.sla_paused_reason)}
                      </Typography>
                    ) : c.sla_at_risk && !slaOverdue ? (
                      <Typography variant="caption" color="warning.main" fontWeight={600}>
                        ⚠ At risk — due {slaRemaining}
                      </Typography>
                    ) : slaRemaining && (
                      <Typography variant="caption" color={slaOverdue ? 'error' : 'text.secondary'}>
                        {slaOverdue ? 'Overdue ' : 'Due '}{slaRemaining}
                      </Typography>
                    )}
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Created</Typography>
                  <Typography variant="body2">{format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Updated</Typography>
                  <Typography variant="body2">{format(new Date(c.updated_at), 'dd MMM yyyy HH:mm')}</Typography>
                </Box>
                {c.resolved_at && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Resolved</Typography>
                    <Typography variant="body2">{format(new Date(c.resolved_at), 'dd MMM yyyy HH:mm')}</Typography>
                  </Box>
                )}
                {c.sla_paused_total_minutes > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Excluded (paused)</Typography>
                    <Typography variant="body2">{fmtMinutes(c.sla_paused_total_minutes)}</Typography>
                  </Box>
                )}
              </Box>

              {/* SLA pause / exclusion control (stop-the-clock) */}
              {!['resolved', 'closed', 'cancelled'].includes(c.status) && (
                <Box mt={1.5}>
                  {c.sla_paused ? (
                    <Button fullWidth size="small" variant="contained" color="success"
                      startIcon={<PlayArrowIcon />} disabled={resumeMut.isLoading}
                      onClick={() => resumeMut.mutate()}>
                      Resume SLA clock
                    </Button>
                  ) : (
                    <Button fullWidth size="small" variant="outlined" color="warning"
                      startIcon={<PauseIcon />} onClick={() => setSlaPauseOpen(true)}>
                      Pause SLA (exclusion)
                    </Button>
                  )}
                </Box>
              )}

              {/* Pause history */}
              {(slaPauses as any[]).length > 0 && (
                <Box mt={1.5}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>EXCLUSION LOG</Typography>
                  {(slaPauses as any[]).map((p: any) => (
                    <Box key={p.id} sx={{ mt: 0.5, pl: 1, borderLeft: '2px solid #ffb74d' }}>
                      <Typography variant="caption" display="block" fontWeight={600}>
                        {reasonLabel(p.reason)}
                        {p.resumed_at
                          ? <> · {fmtMinutes(p.duration_minutes || 0)}</>
                          : <Chip size="small" color="warning" label="active" sx={{ ml: 0.5, height: 16 }} />}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {format(new Date(p.paused_at), 'dd MMM HH:mm')}
                        {p.resumed_at ? ` → ${format(new Date(p.resumed_at), 'dd MMM HH:mm')}` : ''}
                        {p.note ? ` — ${p.note}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {/* Travel-aware Hybrid SLA breakdown (snapshot taken at creation) */}
              {c.sla_profile === 'hybrid' && c.sla_breakdown?.travel && (() => {
                const bd = c.sla_breakdown; const tv = bd.travel || {};
                return (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#fff3e0', borderRadius: 1, border: '1px solid #ffb74d' }}>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Typography variant="caption" color="warning.dark" fontWeight={700}>
                        HYBRID SLA · {bd.site?.site_code || 'site'}
                      </Typography>
                      {tv.capped && <Chip size="small" color="warning" label="travel capped" sx={{ height: 18 }} />}
                    </Box>
                    <Box display="grid" gridTemplateColumns="auto 1fr" columnGap={2} rowGap={0.3}>
                      <Typography variant="caption" color="text.secondary">Response</Typography>
                      <Typography variant="caption">{bd.fixed_minutes?.response} min</Typography>
                      <Typography variant="caption" color="text.secondary">Travel allowance</Typography>
                      <Typography variant="caption">
                        {tv.allowance_minutes} min&nbsp;
                        <Typography component="span" variant="caption" color="text.secondary">
                          ({tv.base_minutes}×{tv.road_factor}×{tv.security_factor}×{tv.seasonal_factor} + {tv.access_delay_minutes}{tv.convoy_minutes ? ` + ${tv.convoy_minutes} convoy` : ''})
                        </Typography>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">On-site restore</Typography>
                      <Typography variant="caption">{bd.fixed_minutes?.onsite_restore} min</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>Total target</Typography>
                      <Typography variant="caption" fontWeight={700}>{Math.round((bd.total_minutes || 0) / 6) / 10} h</Typography>
                    </Box>
                  </Box>
                );
              })()}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Action Dialog ── */}
      <Dialog open={!!actionDialog} onClose={() => setActionDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog?.label}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {actionDialog?.requiresResolution && (
            <>
              <FormControl fullWidth size="small" required>
                <InputLabel>Resolution Code *</InputLabel>
                <Select value={resolutionCode} label="Resolution Code *"
                  onChange={e => setResolutionCode(e.target.value)}>
                  {RESOLUTION_CODES.map(rc => (
                    <MenuItem key={rc} value={rc}>{rc}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField fullWidth size="small" multiline rows={3}
                label="Resolution Notes *"
                placeholder="Describe what was done to resolve this case…"
                value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} />
            </>
          )}
          <TextField fullWidth size="small" multiline rows={2}
            label="Comment (saved as work note)"
            value={actionComment} onChange={e => setActionComment(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(null)}>Cancel</Button>
          <Button variant="contained"
            color={actionDialog?.color as any || 'primary'}
            disabled={
              transitionMut.isLoading ||
              (actionDialog?.requiresResolution && (!resolutionCode || !resolutionNotes))
            }
            onClick={() => actionDialog && transitionMut.mutate(actionDialog)}>
            {transitionMut.isLoading ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── SLA Pause Dialog ── */}
      <Dialog open={slaPauseOpen} onClose={() => setSlaPauseOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Pause SLA clock</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            The breach clock stops while paused. On resume, the due date is pushed out by the paused time so only net working time counts.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Exclusion reason</InputLabel>
            <Select value={slaReason} label="Exclusion reason" onChange={e => setSlaReason(e.target.value)}>
              {(pauseReasons as any[]).map((r: any) => (
                <MenuItem key={r.code} value={r.code}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField fullWidth size="small" multiline rows={2} label="Note (optional)"
            value={slaNote} onChange={e => setSlaNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSlaPauseOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" disabled={pauseMut.isLoading}
            onClick={() => pauseMut.mutate()}>Pause</Button>
        </DialogActions>
      </Dialog>

      {/* ── Declare Major Incident Dialog ── */}
      <Dialog open={majorOpen} onClose={() => setMajorOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>Declare Major Incident</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Alert severity="warning">
            This escalates the case to <strong>P1 / critical</strong>, assigns a Major Incident Manager
            and alerts management. Use only for high-impact, customer- or core-affecting incidents.
          </Alert>
          <TextField fullWidth size="small" multiline rows={3} label="Reason / impact summary"
            value={majorReason} onChange={e => setMajorReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMajorOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={declareMajorMut.isLoading}
            onClick={() => declareMajorMut.mutate()}>Declare Major Incident</Button>
        </DialogActions>
      </Dialog>

      {/* ── Reassign Dialog ── */}
      <Dialog open={reassignOpen} onClose={() => setReassignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reassign Case</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Autocomplete
            options={userOptions}
            getOptionLabel={(u: any) => u.display_name || `${u.first_name} ${u.last_name}`}
            value={userOptions.find((u: any) => u.id === newAssigneeId) || null}
            onChange={(_, u) => setNewAssigneeId(u?.id || '')}
            // Only treat genuine typing as a search term. MUI also fires this
            // with reason 'reset' (full "First Last" display label) whenever
            // `value` changes — e.g. right after picking someone from the list
            // — and with reason 'clear' when the field is cleared. Feeding
            // either of those into the search query used to re-query the
            // backend for the full display name, which the server can't match
            // against individual first_name/last_name/email/username columns,
            // silently wiping the just-populated option list back to empty.
            onInputChange={(_, v, reason) => { if (reason === 'input') setAssigneeSearch(v); }}
            renderInput={(params) => <TextField {...params} label="Assignee" size="small" />}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Team</InputLabel>
            <Select value={newTeamId} label="Team"
              onChange={e => {
                // Moving the case to a different team sends it to that team's
                // QUEUE (unassigned), so a member can pick it up. Clear the stale
                // assignee; the user can still pick a specific person afterwards.
                if (e.target.value !== newTeamId) setNewAssigneeId('');
                setNewTeamId(e.target.value);
              }}>
              <MenuItem value="">— None —</MenuItem>
              {orgUnits.map((ou: any) => (
                <MenuItem key={ou.id} value={ou.id}>{ou.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            Leave the assignee empty to put the case in the team's queue (anyone on the team can claim it).
            Pick a person to assign it directly.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={assignMut.isLoading}
            onClick={() => assignMut.mutate()}>
            {assignMut.isLoading ? 'Saving…' : 'Reassign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Escalate snackbar */}
      <Snackbar open={escalateSnack} autoHideDuration={3000} onClose={() => setEscalateSnack(false)}
        message="Case escalated" />
      {/* Just submitted from Service Catalog / New Request */}
      <Snackbar open={submittedSnack} autoHideDuration={4000} onClose={() => setSubmittedSnack(false)}>
        <Alert severity="success" onClose={() => setSubmittedSnack(false)}>
          Request submitted successfully{submittedBusinessKey ? ` — ${submittedBusinessKey}` : ''}
        </Alert>
      </Snackbar>
      {/* Optimistic-lock conflict */}
      <Snackbar open={conflictSnack} autoHideDuration={6000} onClose={() => setConflictSnack(false)}>
        <Alert severity="warning" onClose={() => setConflictSnack(false)}>
          This case was changed by someone else — reloaded with the latest. Please re-apply your change.
        </Alert>
      </Snackbar>
    </Box>
  );
}
