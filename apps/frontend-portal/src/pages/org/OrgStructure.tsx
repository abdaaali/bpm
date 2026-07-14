import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Tab, Tabs,
  Table, TableHead, TableBody, TableRow, TableCell, CircularProgress,
  TextField, InputAdornment, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl, InputLabel,
  FormControlLabel, Checkbox, Tooltip, Alert, Divider, Stack, Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BusinessIcon from '@mui/icons-material/Business';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import { orgApi } from '../../api/client';
import { useAccess } from '../../auth/useAccess';

// ── helpers ────────────────────────────────────────────────────────────────────

function flattenTree(nodes: any[], depth = 0): any[] {
  return nodes.flatMap(n => [{ ...n, _depth: depth }, ...flattenTree(n.children || [], depth + 1)]);
}

// Must match the org_units.type CHECK constraint in the DB.
const ORG_TYPES = ['company', 'division', 'department', 'section', 'team'];

// Every resource:action permission actually enforced anywhere in the platform
// — verified against `@RequirePermission(...)` usage across every
// services/api-gateway/src/**/*.controller.ts route (the actual enforcement
// point; services/api-gateway/src/auth/permissions.ts's ROLE_PERMISSIONS is
// just the default grant set for seeded roles). Keep this in sync with the
// gateway controllers when a new permission is introduced.
//
// Two permissions below (org:read, rca:read, mdm:read) are NOT checked by any
// gateway route today — every GET route in org.controller.ts, rca.controller.ts
// and the read side of mdm are open to any authenticated user regardless of
// permissions. They still do something real: the frontend nav (Layout.tsx /
// Launcher.tsx) uses them to decide whether to show the Organization / RCA /
// Master Data sections at all. Their descriptions are phrased accordingly
// (visibility, not access control) rather than overstating what they gate.
const PERMISSION_GROUPS: { resource: string; label: string; actions: { action: string; label: string; description: string }[] }[] = [
  {
    resource: 'cases', label: 'Cases', actions: [
      { action: 'read', label: 'View', description: 'View cases, their details, comments and history' },
      { action: 'create', label: 'Create', description: 'Create new cases' },
      { action: 'update', label: 'Edit', description: 'Edit case fields, add comments, save RCA and CAPA actions, raise vendor escalations' },
      { action: 'assign', label: 'Assign / Claim', description: 'Assign a case to a user, or claim an unclaimed case from the team queue' },
      { action: 'link', label: 'Link', description: 'Link related cases together (duplicate of, caused by, blocks, etc.)' },
      { action: 'workorder', label: 'Dispatch work order', description: 'Dispatch a case to an external contractor as a work order' },
    ],
  },
  {
    resource: 'tasks', label: 'Tasks', actions: [
      { action: 'read', label: 'View', description: 'View process tasks in the work inbox' },
      { action: 'claim', label: 'Claim', description: 'Claim an unclaimed pool task' },
      { action: 'complete', label: 'Complete', description: 'Complete or submit a task, advancing its process' },
      { action: 'reassign', label: 'Reassign', description: 'Reassign a task to a different user' },
    ],
  },
  {
    resource: 'approvals', label: 'Approvals', actions: [
      { action: 'read', label: 'View', description: 'View approval requests, policies and their status' },
      { action: 'decide', label: 'Approve / Reject', description: 'Approve or reject a pending approval step assigned to you' },
      { action: 'manage', label: 'Manage policies', description: 'Create and edit approval policies (who approves what, and when)' },
    ],
  },
  {
    resource: 'processes', label: 'Process Studio', actions: [
      { action: 'read', label: 'View', description: 'View process definitions, the process monitor, and process analytics' },
      { action: 'design', label: 'Design', description: 'Create and edit BPMN process definitions in Process Studio (draft versions only)' },
      { action: 'publish', label: 'Publish', description: 'Publish, unpublish, archive or delete a process definition version — makes it live' },
    ],
  },
  {
    resource: 'contractors', label: 'External Workforce', actions: [
      { action: 'read', label: 'View', description: 'View contractor companies, external workers and dispatch/submission history' },
      { action: 'dispatch', label: 'Dispatch', description: 'Dispatch work orders to contractors and respond to reschedule requests' },
      { action: 'manage', label: 'Manage', description: 'Create and edit contractor company and external worker records' },
    ],
  },
  {
    resource: 'mdm', label: 'Master Data (MDM) & SLA', actions: [
      { action: 'read', label: 'View', description: 'Show Master Data / DataHub screens in the navigation (view-only)' },
      { action: 'write', label: 'Edit', description: 'Add, edit or delete MDM hosts and lookups, DataHub reference data, and SLA target policies' },
    ],
  },
  {
    resource: 'org', label: 'Organization', actions: [
      { action: 'read', label: 'View', description: 'Show the Organization section (units, users, positions, roles) in the navigation' },
      { action: 'manage', label: 'Manage', description: 'Create, edit and deactivate org units, positions, users, and roles — including this permissions screen' },
    ],
  },
  {
    resource: 'audit', label: 'Audit & Retention', actions: [
      { action: 'read', label: 'View', description: 'View the audit log and case/request retention status' },
      { action: 'manage', label: 'Manage', description: 'Run retention archival and restore archived cases/requests' },
    ],
  },
  {
    resource: 'notifications', label: 'Notifications', actions: [
      { action: 'manage', label: 'Manage', description: 'Edit notification templates; manage the management digest schedule and recipients' },
    ],
  },
  {
    resource: 'analytics', label: 'Analytics & Dashboards', actions: [
      { action: 'read', label: 'View', description: 'View operational dashboards, process analytics, custom reports, and the digest overview' },
    ],
  },
  {
    resource: 'rca', label: 'Root Cause Analysis', actions: [
      { action: 'read', label: 'View', description: 'Show the Root Cause Analysis dashboards in the navigation' },
    ],
  },
  {
    resource: 'connectors', label: 'Integrations', actions: [
      { action: 'manage', label: 'Manage', description: 'Create, edit, test and view logs for integration connectors (REST/webhook/Kafka/cron)' },
    ],
  },
];

// ── Org Unit Dialog ─────────────────────────────────────────────────────────

function OrgUnitDialog({ open, onClose, initial, parentId, allUnits, onSave }: any) {
  const [form, setForm] = useState({ name: '', type: 'department', code: '', parentId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name || '',
        type: initial?.type || 'department',
        code: initial?.code || '',
        parentId: initial ? (initial.parent_id || '') : (parentId || ''),
      });
      setError('');
    }
  }, [open, initial, parentId]);

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (initial) {
        await orgApi.updateOrgUnit(initial.id, { name: form.name, code: form.code || null, parentId: form.parentId || null });
      } else {
        await orgApi.createOrgUnit({ name: form.name, type: form.type, code: form.code || null, parentId: form.parentId || null });
      }
      onSave(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  // When editing, a unit can't become its own parent or move under its own
  // descendant — the backend enforces this for real, this is just UX so the
  // dropdown doesn't offer an obviously-invalid target. Uses the same
  // materialized-path segment check the backend uses.
  const invalidParentIds = initial
    ? new Set(allUnits.filter((u: any) => (u.path || '').split('/').filter(Boolean).includes(initial.id)).map((u: any) => u.id))
    : new Set();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Department / Unit' : 'Add Department / Unit'}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} mt={1}>
          <TextField label="Name *" value={form.name} onChange={set('name')} fullWidth autoFocus />
          {!initial && (
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={form.type} onChange={set('type')} label="Type">
                {ORG_TYPES.map(t => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <FormControl fullWidth>
            <InputLabel>Parent Unit</InputLabel>
            <Select value={form.parentId} onChange={set('parentId')} label="Parent Unit">
              <MenuItem value="">— None (Root) —</MenuItem>
              {allUnits.filter((u: any) => !invalidParentIds.has(u.id)).map((u: any) => (
                <MenuItem key={u.id} value={u.id}>
                  {'  '.repeat(u._depth || 0)}{u.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Code (optional)" value={form.code} onChange={set('code')} fullWidth placeholder="e.g. ENG, FIN" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Org Unit Manager Dialog ──────────────────────────────────────────────────
// "Designate manager" is fully composed from existing endpoints — no new
// backend concept: create a manager-flagged position for the unit if none
// exists (POST /positions), attach the chosen user with it
// (POST /users/:id/assignments), replacing any existing non-primary
// assignment they already hold to this same unit first (DELETE .../assignments/:id,
// added for Feature 2) to avoid a duplicate-assignment rejection.

function OrgUnitManagerDialog({ open, onClose, unit, allPositions, users, can, onSaved }: any) {
  const qc = useQueryClient();
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [newPositionName, setNewPositionName] = useState('');
  const [newPositionLevel, setNewPositionLevel] = useState(5);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: chain, isLoading } = useQuery(
    ['manager-chain', unit?.id],
    () => orgApi.getManagerChain(unit.id),
    { enabled: open && !!unit },
  );

  useEffect(() => {
    if (open) {
      setSelectedPositionId(''); setNewPositionName(''); setNewPositionLevel(5);
      setSelectedUserId(''); setIsPrimary(false); setError('');
    }
  }, [open, unit]);

  if (!unit) return null;

  const managerPositions = allPositions.filter((p: any) => p.org_unit_id === unit.id && p.is_manager);
  const directEntry = chain?.find((c: any) => c.orgUnit?.id === unit.id);
  const inheritedEntry = !directEntry && chain?.length ? chain[0] : null;

  const designate = async () => {
    if (!selectedUserId) { setError('Choose a person to designate'); return; }
    if (!selectedPositionId && !newPositionName.trim()) { setError('Choose or create a manager position'); return; }
    setBusy(true); setError('');
    try {
      let positionId = selectedPositionId;
      if (!positionId) {
        const created = await orgApi.createPosition({ name: newPositionName, orgUnitId: unit.id, level: +newPositionLevel, isManager: true });
        positionId = created.id;
      }
      // Replace an existing non-primary assignment this user already has to
      // this same unit, so the new manager-position assignment isn't rejected
      // as a duplicate.
      const hierarchy = await orgApi.getUserHierarchy(selectedUserId);
      const existingForUnit = (hierarchy.assignments || []).find((a: any) => a.org_unit_id === unit.id);
      if (existingForUnit && !existingForUnit.is_primary) {
        await orgApi.removeAssignment(selectedUserId, existingForUnit.id);
      }
      await orgApi.assignOrgUnit(selectedUserId, { orgUnitId: unit.id, positionId, isPrimary });
      qc.invalidateQueries(['manager-chain', unit.id]);
      qc.invalidateQueries('org-positions');
      qc.invalidateQueries('org-users');
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not designate manager');
    } finally { setBusy(false); }
  };

  const undesignate = async () => {
    if (!directEntry?.manager?.id) return;
    setBusy(true); setError('');
    try {
      const hierarchy = await orgApi.getUserHierarchy(directEntry.manager.id);
      const assignment = (hierarchy.assignments || []).find((a: any) => a.org_unit_id === unit.id);
      if (!assignment) { setError('Could not find their assignment to this unit'); return; }
      await orgApi.removeAssignment(directEntry.manager.id, assignment.id);
      qc.invalidateQueries(['manager-chain', unit.id]);
      onSaved?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not remove — if this is their primary assignment, change it via Edit User instead');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manager — {unit.name}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {isLoading ? <CircularProgress size={20} /> : (
          <Stack spacing={2}>
            {directEntry ? (
              <Box sx={{ px: 2, py: 1.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(46,125,50,0.15)' : '#f1f8f2', borderRadius: 2, border: '1px solid', borderColor: 'success.main' }}>
                <Typography variant="caption" color="success.main" fontWeight={600}>Current manager</Typography>
                <Typography variant="body2" mt={0.5}>
                  <strong>{directEntry.manager.first_name} {directEntry.manager.last_name}</strong> — {directEntry.manager.position_name}
                </Typography>
                {can('org:manage') && (
                  <Button size="small" color="error" sx={{ mt: 1 }} disabled={busy} onClick={undesignate}>Remove</Button>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No manager designated directly on this unit.
                {inheritedEntry && <> Currently inherits from <strong>{inheritedEntry.orgUnit.name}</strong>: {inheritedEntry.manager.first_name} {inheritedEntry.manager.last_name}.</>}
              </Typography>
            )}

            {managerPositions.length > 1 && (
              <Alert severity="info" sx={{ py: 0 }}>
                {managerPositions.length} manager-flagged positions exist on this unit — approval routing picks whichever assignment has the highest position level.
              </Alert>
            )}

            {can('org:manage') && (
              <>
                <Divider><Typography variant="caption" color="text.secondary">Designate manager</Typography></Divider>
                <FormControl fullWidth size="small">
                  <InputLabel>Manager position</InputLabel>
                  <Select value={selectedPositionId} label="Manager position" onChange={(e: any) => setSelectedPositionId(e.target.value)}>
                    <MenuItem value="">— Create new position —</MenuItem>
                    {managerPositions.map((p: any) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                  </Select>
                </FormControl>
                {!selectedPositionId && (
                  <Box display="flex" gap={1}>
                    <TextField size="small" label="New position title" value={newPositionName} onChange={(e: any) => setNewPositionName(e.target.value)} fullWidth />
                    <TextField size="small" label="Level" type="number" value={newPositionLevel} onChange={(e: any) => setNewPositionLevel(e.target.value)} sx={{ width: 100 }} />
                  </Box>
                )}
                <FormControl fullWidth size="small">
                  <InputLabel>Person</InputLabel>
                  <Select value={selectedUserId} label="Person" onChange={(e: any) => setSelectedUserId(e.target.value)}>
                    {users.map((u: any) => <MenuItem key={u.id} value={u.id}>{u.display_name || `${u.first_name} ${u.last_name}`}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Checkbox checked={isPrimary} onChange={(e: any) => setIsPrimary(e.target.checked)} />}
                  label="Make this their primary assignment" />
                <Button variant="contained" disabled={busy} onClick={designate}>
                  {busy ? <CircularProgress size={18} /> : 'Designate'}
                </Button>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Position Dialog ─────────────────────────────────────────────────────────

function PositionDialog({ open, onClose, initial, allUnits, onSave }: any) {
  const [form, setForm] = useState({ name: '', orgUnitId: '', level: 1, isManager: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name || '',
        orgUnitId: initial?.org_unit_id || '',
        level: initial?.level || 1,
        isManager: initial?.is_manager || false,
      });
      setError('');
    }
  }, [open, initial]);

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.orgUnitId) { setError('Department is required'); return; }
    setSaving(true); setError('');
    try {
      const dto = { name: form.name, orgUnitId: form.orgUnitId, level: +form.level, isManager: form.isManager };
      if (initial) await orgApi.updatePosition(initial.id, dto);
      else await orgApi.createPosition(dto);
      onSave(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Position' : 'Add Position'}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} mt={1}>
          <TextField label="Position Title *" value={form.name} onChange={set('name')} fullWidth autoFocus />
          <FormControl fullWidth>
            <InputLabel>Department *</InputLabel>
            <Select value={form.orgUnitId} onChange={set('orgUnitId')} label="Department *">
              {allUnits.map((u: any) => (
                <MenuItem key={u.id} value={u.id}>
                  {'  '.repeat(u._depth || 0)}{u.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Level (1 = junior, 10 = executive)" type="number" value={form.level}
            onChange={set('level')} fullWidth inputProps={{ min: 1, max: 10 }} />
          <FormControlLabel
            control={<Checkbox checked={form.isManager} onChange={e => setForm(f => ({ ...f, isManager: e.target.checked }))} />}
            label="This is a manager position (used for approval routing)" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── User Assignments Panel (secondary team memberships) ─────────────────────
// Lets an admin add/remove additional (non-primary) org unit assignments for
// an existing user — the primary one is still managed via the Department/
// Position fields above. POST /users/:id/assignments and
// DELETE /users/:id/assignments/:assignmentId already exist end-to-end.

function UserAssignmentsPanel({ userId, allUnits, allPositions }: any) {
  const qc = useQueryClient();
  const [addOrgUnitId, setAddOrgUnitId] = useState('');
  const [addPositionId, setAddPositionId] = useState('');
  const [error, setError] = useState('');

  const { data: hierarchy, isLoading } = useQuery(
    ['user-hierarchy', userId],
    () => orgApi.getUserHierarchy(userId),
    { enabled: !!userId },
  );
  const assignments: any[] = hierarchy?.assignments || [];

  const addMut = useMutation(
    () => orgApi.assignOrgUnit(userId, { orgUnitId: addOrgUnitId, positionId: addPositionId || null, isPrimary: false }),
    {
      onSuccess: () => { qc.invalidateQueries(['user-hierarchy', userId]); setAddOrgUnitId(''); setAddPositionId(''); setError(''); },
      onError: (e: any) => setError(e?.response?.data?.message || 'Could not add assignment'),
    },
  );
  const removeMut = useMutation(
    (assignmentId: string) => orgApi.removeAssignment(userId, assignmentId),
    {
      onSuccess: () => qc.invalidateQueries(['user-hierarchy', userId]),
      onError: (e: any) => setError(e?.response?.data?.message || 'Could not remove assignment'),
    },
  );

  const positionsForAddUnit = allPositions.filter((p: any) => !addOrgUnitId || p.org_unit_id === addOrgUnitId);
  const alreadyAssigned = assignments.some((a: any) => a.org_unit_id === addOrgUnitId && (a.position_id || null) === (addPositionId || null));

  return (
    <Box sx={{ px: 2, py: 1.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#fafafa', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>Additional Team Memberships</Typography>
      {error && <Alert severity="error" sx={{ mt: 1, mb: 1 }} onClose={() => setError('')}>{error}</Alert>}
      {isLoading ? (
        <Box display="flex" alignItems="center" gap={1} mt={0.5}><CircularProgress size={14} /><Typography variant="body2">Loading...</Typography></Box>
      ) : (
        <Stack spacing={0.5} mt={0.5}>
          {assignments.length === 0 && <Typography variant="body2" color="text.secondary">No assignments yet.</Typography>}
          {assignments.map((a: any) => (
            <Box key={a.id} display="flex" alignItems="center" justifyContent="space-between" py={0.3}>
              <Typography variant="body2">
                {a.org_unit_name}{a.position_name ? ` — ${a.position_name}` : ''}
                {a.is_primary && <Chip label="Primary" size="small" color="primary" sx={{ ml: 1, height: 18 }} />}
              </Typography>
              <Tooltip title={a.is_primary ? "Change the Department field above to replace the primary assignment" : "Remove this assignment"}>
                <span>
                  <IconButton size="small" disabled={a.is_primary || removeMut.isLoading} onClick={() => removeMut.mutate(a.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}
      <Box display="flex" gap={1} mt={1.5} alignItems="center">
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Add team</InputLabel>
          <Select value={addOrgUnitId} label="Add team" onChange={(e: any) => { setAddOrgUnitId(e.target.value); setAddPositionId(''); }}>
            {allUnits.map((u: any) => (
              <MenuItem key={u.id} value={u.id}>{'  '.repeat(u._depth || 0)}{u.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1 }} disabled={!addOrgUnitId}>
          <InputLabel>Position</InputLabel>
          <Select value={addPositionId} label="Position" onChange={(e: any) => setAddPositionId(e.target.value)}>
            <MenuItem value="">— No position —</MenuItem>
            {positionsForAddUnit.map((p: any) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" disabled={!addOrgUnitId || alreadyAssigned || addMut.isLoading} onClick={() => addMut.mutate()}>
          Add
        </Button>
      </Box>
      {alreadyAssigned && <Typography variant="caption" color="text.secondary">Already assigned to this team/position.</Typography>}
    </Box>
  );
}

// ── User Dialog ─────────────────────────────────────────────────────────────

function UserDialog({ open, onClose, initial, allUnits, allPositions, allRoles, onSave }: any) {
  const [form, setForm] = useState<any>({
    firstName: '', lastName: '', username: '', email: '',
    password: '', orgUnitId: '', positionId: '', roleIds: [],
  });
  const [reportsTo, setReportsTo] = useState<any>(null);
  const [loadingManager, setLoadingManager] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetSnack, setResetSnack] = useState('');

  const isNew = !initial;

  const forceResetMut = useMutation(() => orgApi.forcePasswordReset(initial?.id), {
    onSuccess: () => setResetSnack(`${initial?.display_name || 'User'} must set a new password at their next login.`),
    onError: (e: any) => setResetSnack(e?.response?.data?.message || 'Could not force a password reset'),
  });

  useEffect(() => {
    if (open) {
      setForm({
        firstName: initial?.first_name || '',
        lastName: initial?.last_name || '',
        username: initial?.username || '',
        email: initial?.email || '',
        password: '',
        orgUnitId: initial?.primary_org_unit_id || '',
        positionId: initial?.primary_position_id || '',
        roleIds: initial?.role_ids?.filter(Boolean) || [],
      });
      setReportsTo(null);
      setError('');
    }
  }, [open, initial]);

  // Auto-fetch "Reports To" when org unit changes
  useEffect(() => {
    if (!form.orgUnitId) { setReportsTo(null); return; }
    setLoadingManager(true);
    orgApi.getManagerChain(form.orgUnitId)
      .then((chain: any[]) => setReportsTo(chain?.[0]?.manager || null))
      .catch(() => setReportsTo(null))
      .finally(() => setLoadingManager(false));
  }, [form.orgUnitId]);

  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  // Filter positions to the selected org unit
  const positionsForUnit = allPositions.filter((p: any) =>
    !form.orgUnitId || p.org_unit_id === form.orgUnitId
  );

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('First and last name are required'); return; }
    if (!form.username.trim()) { setError('Username is required'); return; }
    if (!form.email.trim()) { setError('Email is required'); return; }
    if (isNew && !form.password.trim()) { setError('Password is required for new users'); return; }
    setSaving(true); setError('');
    try {
      if (isNew) {
        await orgApi.createUser({
          firstName: form.firstName, lastName: form.lastName,
          username: form.username, email: form.email, password: form.password,
          orgUnitId: form.orgUnitId || undefined,
          positionId: form.positionId || undefined,
          roleIds: form.roleIds,
        });
      } else {
        await orgApi.updateUser(initial.id, {
          firstName: form.firstName, lastName: form.lastName,
          email: form.email, username: form.username,
          orgUnitId: form.orgUnitId || null,
          positionId: form.positionId || null,
          roleIds: form.roleIds,
          ...(form.password ? { password: form.password } : {}),
        });
      }
      onSave(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || String(e?.response?.data || 'Save failed'));
    } finally { setSaving(false); }
  };

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'Add User' : `Edit User — ${initial?.display_name}`}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} mt={1}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="First Name *" value={form.firstName} onChange={set('firstName')} fullWidth autoFocus />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Last Name *" value={form.lastName} onChange={set('lastName')} fullWidth />
            </Grid>
          </Grid>
          <TextField label="Username *" value={form.username} onChange={set('username')} fullWidth
            disabled={!isNew} helperText={!isNew ? 'Username cannot be changed' : ''} />
          <TextField label="Email *" value={form.email} onChange={set('email')} fullWidth type="email" />
          <TextField
            label={isNew ? 'Password *' : 'New Password (leave blank to keep)'}
            value={form.password} onChange={set('password')} fullWidth type="password"
            helperText={!isNew ? 'Sets this value now — they must still change it at next login' : ''} />
          {!isNew && (
            <Box display="flex" alignItems="center" gap={1}>
              <Button size="small" variant="outlined" disabled={forceResetMut.isLoading} onClick={() => forceResetMut.mutate()}>
                {forceResetMut.isLoading ? <CircularProgress size={16} /> : 'Force password reset'}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Requires them to set a new password next login, without you setting one for them.
              </Typography>
            </Box>
          )}

          <Divider><Typography variant="caption" color="text.secondary">Organisation</Typography></Divider>

          <FormControl fullWidth>
            <InputLabel>Department</InputLabel>
            <Select value={form.orgUnitId} onChange={set('orgUnitId')} label="Department">
              <MenuItem value="">— Not assigned —</MenuItem>
              {allUnits.map((u: any) => (
                <MenuItem key={u.id} value={u.id}>
                  {'  '.repeat(u._depth || 0)}{u.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {form.orgUnitId && (
            <FormControl fullWidth>
              <InputLabel>Position</InputLabel>
              <Select value={form.positionId} onChange={set('positionId')} label="Position">
                <MenuItem value="">— No position —</MenuItem>
                {positionsForUnit.map((p: any) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Reports To — auto-fetched */}
          {form.orgUnitId && (
            <Box sx={{ px: 2, py: 1.5, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(40,86,201,0.12)' : '#f0f7ff', borderRadius: 2, border: '1px solid', borderColor: 'info.main' }}>
              <Typography variant="caption" color="primary" fontWeight={600}>Reports To</Typography>
              {loadingManager ? (
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <CircularProgress size={14} /><Typography variant="body2">Fetching...</Typography>
                </Box>
              ) : reportsTo ? (
                <Typography variant="body2" mt={0.5}>
                  <strong>{reportsTo.first_name} {reportsTo.last_name}</strong>
                  {' — '}{reportsTo.position_name}
                  {reportsTo.org_unit_name ? ` (${reportsTo.org_unit_name})` : ''}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  No manager found in this department's hierarchy
                </Typography>
              )}
            </Box>
          )}

          {!isNew && <UserAssignmentsPanel userId={initial.id} allUnits={allUnits} allPositions={allPositions} />}

          <Divider><Typography variant="caption" color="text.secondary">Access</Typography></Divider>

          <FormControl fullWidth>
            <InputLabel>Roles</InputLabel>
            <Select
              multiple value={form.roleIds}
              onChange={e => setForm((f: any) => ({ ...f, roleIds: e.target.value }))}
              label="Roles"
              renderValue={(selected: any) =>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id: string) => {
                    const r = allRoles.find((r: any) => r.id === id);
                    return <Chip key={id} label={r?.name || id} size="small" />;
                  })}
                </Box>
              }>
              {allRoles.map((r: any) => (
                <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : isNew ? 'Create User' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
    <Snackbar open={!!resetSnack} autoHideDuration={4000} onClose={() => setResetSnack('')} message={resetSnack} />
    </>
  );
}

// ── Org Tree Node ────────────────────────────────────────────────────────────

function OrgTreeNode({ node, depth, onAddChild, onEdit, onDelete, onManage }: any) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;

  return (
    <Box sx={{ pl: depth * 3 }}>
      <Box
        display="flex" alignItems="center" gap={1} py={0.75} px={1}
        sx={{ '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}>
        <Box sx={{ width: 20, cursor: hasChildren ? 'pointer' : 'default' }} onClick={() => hasChildren && setOpen(o => !o)}>
          {hasChildren ? (open ? '▼' : '▶') : '•'}
        </Box>
        <BusinessIcon fontSize="small" sx={{ color: '#1976d2', opacity: 0.7 }} />
        <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>{node.name}</Typography>
        <Chip label={node.type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        {node.code && <Chip label={node.code} size="small" sx={{ fontSize: 11, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(156,39,176,0.18)' : '#f3e5f5' }} />}
        <Tooltip title="Manager">
          <IconButton size="small" onClick={() => onManage(node)}>
            <SupervisorAccountIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add child unit">
          <IconButton size="small" onClick={() => onAddChild(node.id)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => onEdit(node)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Deactivate">
          <IconButton size="small" color="error" onClick={() => onDelete(node)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {open && node.children?.map((child: any) => (
        <OrgTreeNode key={child.id} node={child} depth={depth + 1}
          onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} onManage={onManage} />
      ))}
    </Box>
  );
}

// ── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({ open, title, message, onConfirm, onClose, confirmColor = 'error' }: any) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); onClose(); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography>{message}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color={confirmColor} onClick={handleConfirm} disabled={loading}>
          {loading ? <CircularProgress size={18} /> : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrgStructure() {
  const qc = useQueryClient();
  const { can } = useAccess();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');

  // Dialogs state
  const [orgUnitDlg, setOrgUnitDlg] = useState<{ open: boolean; initial?: any; parentId?: string }>({ open: false });
  const [posDlg, setPosDlg] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [userDlg, setUserDlg] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [managerDlg, setManagerDlg] = useState<{ open: boolean; unit?: any }>({ open: false });
  // role: undefined -> "Add Role" (create) mode; a role object -> "Edit Role" mode.
  const [roleDlg, setRoleDlg] = useState<{ open: boolean; role?: any }>({ open: false });
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; title: string; message: string; onConfirm: () => Promise<any> }>({
    open: false, title: '', message: '', onConfirm: async () => {},
  });

  const saveRole = useMutation(
    (dto: any) => roleDlg.role ? orgApi.updateRole(roleDlg.role.id, dto) : orgApi.createRole(dto),
    { onSuccess: () => { qc.invalidateQueries('org-roles'); setRoleDlg({ open: false }); } },
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries('org-tree');
    qc.invalidateQueries('org-units');
    qc.invalidateQueries('org-users');
    qc.invalidateQueries('org-positions');
  }, [qc]);

  const { data: tree,      isLoading: treeLoading }  = useQuery('org-tree',      orgApi.getTree);
  const { data: orgUnitsR, isLoading: unitsLoading }  = useQuery('org-units',     () => orgApi.getOrgUnits());
  const { data: usersR,    isLoading: usersLoading }  = useQuery('org-users',     () => orgApi.getUsers(1, 200));
  const { data: positionsR }                          = useQuery('org-positions', () => orgApi.getPositions());
  const { data: rolesR }                              = useQuery('org-roles',     orgApi.getRoles);

  const allUnits: any[]    = flattenTree(Array.isArray(tree) ? tree : tree ? [tree] : []);
  const allPositions: any[] = positionsR?.data || positionsR || [];
  const allRoles: any[]    = rolesR?.data || rolesR || [];
  const users: any[]       = usersR?.data || [];

  const filteredUsers = users.filter((u: any) =>
    !search ||
    (u.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(search.toLowerCase()),
  );

  // ── Confirm helpers ──────────────────────────────────────────────────────
  const confirmDeactivateUser = (u: any) => setConfirmDlg({
    open: true,
    title: u.active ? 'Deactivate User' : 'Activate User',
    message: u.active
      ? `Deactivate ${u.display_name}? They will lose portal access.`
      : `Activate ${u.display_name}? They will regain portal access.`,
    onConfirm: async () => {
      u.active ? await orgApi.deactivateUser(u.id) : await orgApi.activateUser(u.id);
      qc.invalidateQueries('org-users');
    },
  });

  const confirmDeleteOrgUnit = (unit: any) => setConfirmDlg({
    open: true,
    title: 'Deactivate Department / Unit',
    message: `Deactivate "${unit.name}"? Users assigned here will not be removed.`,
    onConfirm: async () => { await orgApi.deleteOrgUnit(unit.id); invalidate(); },
  });

  return (
    <Box>
      <Typography variant="h4" mb={3}>Organisation Structure</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<AccountTreeIcon />} iconPosition="start" label="Org Tree" />
        <Tab icon={<PersonAddIcon />} iconPosition="start" label="Users" />
        <Tab label="Positions" />
        <Tab label="Roles" />
      </Tabs>

      {/* ── Tab 0: Org Tree ── */}
      {tab === 0 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Organisation Hierarchy</Typography>
              <Button variant="contained" startIcon={<AddIcon />}
                onClick={() => setOrgUnitDlg({ open: true })}>
                Add Root Unit
              </Button>
            </Box>
            {treeLoading || unitsLoading ? <CircularProgress /> :
              !Array.isArray(tree) || tree.length === 0 ? (
                <Typography color="text.secondary">No org units yet. Click "Add Root Unit" to start.</Typography>
              ) : (
                tree.map((n: any) => (
                  <OrgTreeNode key={n.id} node={n} depth={0}
                    onAddChild={(pid: string) => setOrgUnitDlg({ open: true, parentId: pid })}
                    onEdit={(unit: any) => setOrgUnitDlg({ open: true, initial: unit })}
                    onDelete={confirmDeleteOrgUnit}
                    onManage={(unit: any) => setManagerDlg({ open: true, unit })} />
                ))
              )
            }
          </CardContent>
        </Card>
      )}

      {/* ── Tab 1: Users ── */}
      {tab === 1 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
              <TextField size="small" placeholder="Search users…" value={search}
                onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                sx={{ minWidth: 240 }} />
              <Button variant="contained" startIcon={<PersonAddIcon />}
                onClick={() => setUserDlg({ open: true })}>
                Add User
              </Button>
            </Box>
            {usersLoading ? <CircularProgress /> : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Reports To</TableCell>
                    <TableCell>Roles</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((u: any) => (
                    <UserRow key={u.id} user={u}
                      onEdit={() => setUserDlg({ open: true, initial: u })}
                      onToggle={() => confirmDeactivateUser(u)} />
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <Typography color="text.secondary" py={2}>No users found</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Positions ── */}
      {tab === 2 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Positions</Typography>
              <Button variant="contained" startIcon={<AddIcon />}
                onClick={() => setPosDlg({ open: true })}>
                Add Position
              </Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Position Title</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell>Level</TableCell>
                  <TableCell>Manager</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allPositions.map((p: any) => (
                  <TableRow key={p.id} hover>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.org_unit_name || '—'}</TableCell>
                    <TableCell>{p.level || '—'}</TableCell>
                    <TableCell>
                      {p.is_manager
                        ? <Chip label="Manager" size="small" color="primary" />
                        : <Chip label="Individual" size="small" variant="outlined" />}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => setPosDlg({ open: true, initial: p })}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {allPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary" py={2}>No positions yet</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 3: Roles ── */}
      {tab === 3 && (
        <>
          {can('org:manage') && (
            <Box display="flex" justifyContent="flex-end" mb={2}>
              <Button
                variant="contained" size="small" startIcon={<AddIcon />}
                onClick={() => { setRoleDlg({ open: true, role: undefined }); setRolePerms(new Set()); }}
              >
                Add Role
              </Button>
            </Box>
          )}
          <Grid container spacing={2}>
            {allRoles.map((r: any) => (
              <Grid item key={r.id} xs={12} sm={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                      <Box>
                        <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.key || r.slug}</Typography>
                      </Box>
                      {can('org:manage') && (
                        <IconButton size="small" onClick={() => { setRoleDlg({ open: true, role: r }); setRolePerms(new Set(r.permissions || [])); }}><EditIcon fontSize="small" /></IconButton>
                      )}
                    </Box>
                    {r.description && <Typography variant="body2" mt={1}>{r.description}</Typography>}
                    <Typography variant="caption" color="text.secondary" mt={1} sx={{ display: 'block', wordBreak: 'break-word' }}>
                      {(r.permissions || []).join(', ') || 'No permissions'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {allRoles.length === 0 && (
              <Grid item xs={12}>
                <Typography color="text.secondary">No roles defined</Typography>
              </Grid>
            )}
          </Grid>
        </>
      )}
      {roleDlg.open && (
        <Dialog open onClose={() => setRoleDlg({ open: false })} maxWidth="md" fullWidth>
          <DialogTitle>{roleDlg.role ? `Edit Role — ${roleDlg.role.name}` : 'Add Role'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" defaultValue={roleDlg.role?.name || ''} id="role-name" size="small" autoFocus={!roleDlg.role} />
            {!roleDlg.role && (
              <TextField
                label="Key" id="role-key" size="small"
                helperText='Must exactly match a Keycloak realm role name (Keycloak issues each user’s role list at login) — create the same role in the Keycloak admin console and assign it to users there, or this role’s permissions will never apply to anyone. e.g. "field_engineer"'
              />
            )}
            <TextField label="Description" defaultValue={roleDlg.role?.description || ''} id="role-description" size="small" multiline rows={2} />

            <Divider />

            <FormControlLabel
              control={
                <Checkbox
                  checked={rolePerms.has('*')}
                  onChange={(e) => setRolePerms(prev => {
                    const next = new Set(prev);
                    e.target.checked ? next.add('*') : next.delete('*');
                    return next;
                  })}
                />
              }
              label={<Typography fontWeight={600}>Full platform access (*) — grants every permission below</Typography>}
            />

            <Box sx={{ opacity: rolePerms.has('*') ? 0.5 : 1, pointerEvents: rolePerms.has('*') ? 'none' : 'auto' }}>
              <Grid container spacing={2}>
                {PERMISSION_GROUPS.map(group => (
                  <Grid item xs={12} sm={6} key={group.resource}>
                    <Typography variant="subtitle2" fontWeight={600}>{group.label}</Typography>
                    <Box display="flex" flexDirection="column">
                      {group.actions.map(({ action, label, description }) => {
                        const perm = `${group.resource}:${action}`;
                        return (
                          <FormControlLabel
                            key={perm}
                            sx={{ alignItems: 'flex-start', ml: 0, mb: 0.5 }}
                            control={
                              <Checkbox
                                size="small"
                                sx={{ pt: 0.25 }}
                                checked={rolePerms.has(perm)}
                                onChange={(e) => setRolePerms(prev => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(perm) : next.delete(perm);
                                  return next;
                                })}
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight={600}>{label} <Typography component="span" variant="caption" color="text.secondary">({perm})</Typography></Typography>
                                <Typography variant="caption" color="text.secondary">{description}</Typography>
                              </Box>
                            }
                          />
                        );
                      })}
                      {group.actions.length > 1 && (() => {
                        const wildcard = `${group.resource}:*`;
                        return (
                          <FormControlLabel
                            key={wildcard}
                            sx={{ alignItems: 'flex-start', ml: 0, mb: 0.5 }}
                            control={
                              <Checkbox
                                size="small"
                                sx={{ pt: 0.25 }}
                                checked={rolePerms.has(wildcard)}
                                onChange={(e) => setRolePerms(prev => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(wildcard) : next.delete(wildcard);
                                  return next;
                                })}
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight={600}>All {group.label} actions <Typography component="span" variant="caption" color="text.secondary">({wildcard})</Typography></Typography>
                                <Typography variant="caption" color="text.secondary">Grants every {group.label.toLowerCase()} permission above, including any added in the future</Typography>
                              </Box>
                            }
                          />
                        );
                      })()}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRoleDlg({ open: false })}>Cancel</Button>
            <Button
              variant="contained"
              disabled={saveRole.isLoading}
              onClick={() => {
                const name = (document.getElementById('role-name') as HTMLInputElement).value;
                const description = (document.getElementById('role-description') as HTMLInputElement).value;
                const permissions = [...rolePerms];
                if (roleDlg.role) {
                  saveRole.mutate({ name, description, permissions });
                } else {
                  const key = (document.getElementById('role-key') as HTMLInputElement).value.trim();
                  saveRole.mutate({ name, key, description, permissions });
                }
              }}
            >
              {saveRole.isLoading ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Dialogs ── */}
      <OrgUnitDialog
        open={orgUnitDlg.open}
        onClose={() => setOrgUnitDlg({ open: false })}
        initial={orgUnitDlg.initial}
        parentId={orgUnitDlg.parentId}
        allUnits={allUnits}
        onSave={invalidate} />

      <PositionDialog
        open={posDlg.open}
        onClose={() => setPosDlg({ open: false })}
        initial={posDlg.initial}
        allUnits={allUnits}
        onSave={() => qc.invalidateQueries('org-positions')} />

      <UserDialog
        open={userDlg.open}
        onClose={() => setUserDlg({ open: false })}
        initial={userDlg.initial}
        allUnits={allUnits}
        allPositions={allPositions}
        allRoles={allRoles}
        onSave={() => qc.invalidateQueries('org-users')} />

      <ConfirmDialog
        open={confirmDlg.open}
        title={confirmDlg.title}
        message={confirmDlg.message}
        onConfirm={confirmDlg.onConfirm}
        onClose={() => setConfirmDlg(d => ({ ...d, open: false }))} />

      <OrgUnitManagerDialog
        open={managerDlg.open}
        onClose={() => setManagerDlg({ open: false })}
        unit={managerDlg.unit}
        allPositions={allPositions}
        users={users}
        can={can}
        onSaved={invalidate} />
    </Box>
  );
}

// ── User Row (separate component for "Reports To" lazy fetch) ────────────────

function UserRow({ user, onEdit, onToggle }: { user: any; onEdit: () => void; onToggle: () => void }) {
  const [manager, setManager] = useState<any>(null);

  useEffect(() => {
    if (!user.primary_org_unit_id) return;
    orgApi.getManagerChain(user.primary_org_unit_id)
      .then((chain: any[]) => setManager(chain?.[0]?.manager || null))
      .catch(() => {});
  }, [user.primary_org_unit_id]);

  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="body2" fontWeight={500}>{user.display_name}</Typography>
      </TableCell>
      <TableCell>
        {/* .invalid is the seed placeholder domain (RFC 2606) — show a dash
            instead of a fake address until an admin sets a real one. */}
        <Typography variant="body2" color={user.email?.endsWith('.invalid') ? 'text.secondary' : 'text.primary'}>
          {user.email?.endsWith('.invalid') ? '—' : user.email}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">@{user.username}</Typography>
      </TableCell>
      <TableCell>{user.primary_org_unit || '—'}</TableCell>
      <TableCell>{user.primary_position || '—'}</TableCell>
      <TableCell>
        {manager
          ? <Tooltip title={`${manager.position_name} · ${manager.org_unit_name}`}>
              <Typography variant="body2" sx={{ cursor: 'help' }}>
                {manager.first_name} {manager.last_name}
              </Typography>
            </Tooltip>
          : <Typography variant="body2" color="text.secondary">—</Typography>
        }
      </TableCell>
      <TableCell>
        <Box display="flex" flexWrap="wrap" gap={0.5}>
          {(user.role_names || []).filter(Boolean).map((rn: string) => (
            <Chip key={rn} label={rn} size="small" />
          ))}
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={user.active ? 'Active' : 'Inactive'}
          size="small"
          color={user.active ? 'success' : 'default'} />
      </TableCell>
      <TableCell align="right">
        <Tooltip title="Edit user">
          <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={user.active ? 'Deactivate' : 'Activate'}>
          <IconButton size="small" color={user.active ? 'error' : 'success'} onClick={onToggle}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}
