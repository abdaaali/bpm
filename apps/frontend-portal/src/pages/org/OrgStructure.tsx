import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Tab, Tabs,
  Table, TableHead, TableBody, TableRow, TableCell, CircularProgress,
  TextField, InputAdornment, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, MenuItem, Select, FormControl, InputLabel,
  FormControlLabel, Checkbox, Tooltip, Alert, Divider, Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BusinessIcon from '@mui/icons-material/Business';
import { orgApi } from '../../api/client';

// ── helpers ────────────────────────────────────────────────────────────────────

function flattenTree(nodes: any[], depth = 0): any[] {
  return nodes.flatMap(n => [{ ...n, _depth: depth }, ...flattenTree(n.children || [], depth + 1)]);
}

// Must match the org_units.type CHECK constraint in the DB.
const ORG_TYPES = ['company', 'division', 'department', 'section', 'team'];

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
        await orgApi.updateOrgUnit(initial.id, { name: form.name, code: form.code || null });
      } else {
        await orgApi.createOrgUnit({ name: form.name, type: form.type, code: form.code || null, parentId: form.parentId || null });
      }
      onSave(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

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
          {!initial && (
            <FormControl fullWidth>
              <InputLabel>Parent Unit</InputLabel>
              <Select value={form.parentId} onChange={set('parentId')} label="Parent Unit">
                <MenuItem value="">— None (Root) —</MenuItem>
                {allUnits.map((u: any) => (
                  <MenuItem key={u.id} value={u.id}>
                    {'  '.repeat(u._depth || 0)}{u.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
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

  const isNew = !initial;

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
            helperText={!isNew ? 'Only fill in to reset the password' : ''} />

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
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#f0f7ff', borderRadius: 2, border: '1px solid #bbdefb' }}>
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
  );
}

// ── Org Tree Node ────────────────────────────────────────────────────────────

function OrgTreeNode({ node, depth, onAddChild, onEdit, onDelete }: any) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;

  return (
    <Box sx={{ pl: depth * 3 }}>
      <Box
        display="flex" alignItems="center" gap={1} py={0.75} px={1}
        sx={{ '&:hover': { bgcolor: '#f5f5f5' }, borderRadius: 1 }}>
        <Box sx={{ width: 20, cursor: hasChildren ? 'pointer' : 'default' }} onClick={() => hasChildren && setOpen(o => !o)}>
          {hasChildren ? (open ? '▼' : '▶') : '•'}
        </Box>
        <BusinessIcon fontSize="small" sx={{ color: '#1976d2', opacity: 0.7 }} />
        <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>{node.name}</Typography>
        <Chip label={node.type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        {node.code && <Chip label={node.code} size="small" sx={{ fontSize: 11, bgcolor: '#f3e5f5' }} />}
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
          onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
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
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');

  // Dialogs state
  const [orgUnitDlg, setOrgUnitDlg] = useState<{ open: boolean; initial?: any; parentId?: string }>({ open: false });
  const [posDlg, setPosDlg] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [userDlg, setUserDlg] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [confirmDlg, setConfirmDlg] = useState<{ open: boolean; title: string; message: string; onConfirm: () => Promise<any> }>({
    open: false, title: '', message: '', onConfirm: async () => {},
  });

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
                    onDelete={confirmDeleteOrgUnit} />
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
                    <TableCell>Email / Username</TableCell>
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
                      <TableCell colSpan={8} align="center">
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
        <Grid container spacing={2}>
          {allRoles.map((r: any) => (
            <Grid item key={r.id} xs={12} sm={6} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.key || r.slug}</Typography>
                  {r.description && <Typography variant="body2" mt={1}>{r.description}</Typography>}
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
        <Typography variant="body2">{user.email}</Typography>
        <Typography variant="caption" color="text.secondary">@{user.username}</Typography>
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
