import React, { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel,
  Switch, FormControlLabel, Tooltip, Alert, CircularProgress, Autocomplete,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import PersonIcon from '@mui/icons-material/Person';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { contractorApi } from '../../api/client';
import { ExternalCompany } from './ExternalCompanyRegistry';
import BackButton from '../../components/BackButton';

export interface ExternalUser {
  id: string;
  full_name: string;
  email: string;
  username: string;
  company_id: string;
  company_name?: string;
  role: 'company_admin' | 'supervisor' | 'technician' | 'viewer';
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'warning' | 'info'> = {
  company_admin: 'primary',
  supervisor: 'secondary',
  technician: 'info',
  viewer: 'default',
};

const emptyForm = (): Partial<ExternalUser> & { temp_password?: string } => ({
  full_name: '',
  email: '',
  username: '',
  company_id: '',
  role: 'technician',
  active: true,
  temp_password: '',
});

export default function ExternalUserManager() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExternalUser | null>(null);
  const [resetTarget, setResetTarget] = useState<ExternalUser | null>(null);
  const [form, setForm] = useState<Partial<ExternalUser> & { temp_password?: string }>(emptyForm());
  const [newPassword, setNewPassword] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('');
  const [error, setError] = useState('');

  const { data: companies = [] } = useQuery<ExternalCompany[]>(
    'contractor-companies',
    () => contractorApi.getCompanies().then(r => r.data),
  );

  const { data: users = [], isLoading } = useQuery<ExternalUser[]>(
    ['contractor-users', filterCompany],
    () => contractorApi.getUsers(filterCompany ? { company_id: filterCompany } : undefined).then(r => r.data),
  );

  const createMutation = useMutation(
    (dto: any) => contractorApi.createUser(dto),
    {
      onSuccess: () => { qc.invalidateQueries('contractor-users'); closeDialog(); },
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to create user'),
    },
  );

  const updateMutation = useMutation(
    ({ id, dto }: { id: string; dto: any }) => contractorApi.updateUser(id, dto),
    {
      onSuccess: () => { qc.invalidateQueries('contractor-users'); closeDialog(); closeResetDialog(); },
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to update user'),
    },
  );

  // Password reset goes to the dedicated endpoint (updateUser ignores passwords).
  const resetMutation = useMutation(
    ({ id, password }: { id: string; password: string }) => contractorApi.resetPassword(id, { password }),
    {
      onSuccess: () => closeResetDialog(),
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to reset password'),
    },
  );

  const openAdd = () => { setEditTarget(null); setForm(emptyForm()); setError(''); setDialogOpen(true); };
  const openEdit = (u: ExternalUser) => { setEditTarget(u); setForm({ ...u, temp_password: '' }); setError(''); setDialogOpen(true); };
  const openReset = (u: ExternalUser) => { setResetTarget(u); setNewPassword(''); setError(''); setResetDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditTarget(null); setForm(emptyForm()); setError(''); };
  const closeResetDialog = () => { setResetDialogOpen(false); setResetTarget(null); setNewPassword(''); setError(''); };

  const handleSubmit = () => {
    if (!form.full_name?.trim()) { setError('Full name is required'); return; }
    if (!form.email?.trim()) { setError('Email is required'); return; }
    if (!form.company_id) { setError('Company is required'); return; }
    if (editTarget) {
      const { temp_password, ...dto } = form;
      updateMutation.mutate({ id: editTarget.id, dto });
    } else {
      if (!form.username?.trim()) { setError('Username is required'); return; }
      createMutation.mutate(form);
    }
  };

  const handleResetPassword = () => {
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (resetTarget) {
      resetMutation.mutate({ id: resetTarget.id, password: newPassword });
    }
  };

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.company_name]));

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>External User Manager</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add User</Button>
      </Box>

      {/* Filter */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Filter by Company</InputLabel>
              <Select
                value={filterCompany}
                label="Filter by Company"
                onChange={e => setFilterCompany(e.target.value)}
              >
                <MenuItem value="">All Companies</MenuItem>
                {companies.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.company_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell><b>Full Name</b></TableCell>
                <TableCell><b>Email / Username</b></TableCell>
                <TableCell><b>Company</b></TableCell>
                <TableCell><b>Role</b></TableCell>
                <TableCell><b>Active</b></TableCell>
                <TableCell><b>Last Login</b></TableCell>
                <TableCell><b>Actions</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="body2" fontWeight={600}>{u.full_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{u.email}</Typography>
                      <Typography variant="caption" color="text.secondary">@{u.username}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{u.company_name || companyMap[u.company_id] || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={u.role.replace('_', ' ')} size="small" color={ROLE_COLORS[u.role] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        size="small"
                        onChange={() => updateMutation.mutate({ id: u.id, dto: { active: !u.active } })}
                        color="success"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(u)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reset Password">
                        <IconButton size="small" onClick={() => openReset(u)}>
                          <LockResetIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? `Edit: ${editTarget.full_name}` : 'Add Contractor User'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Full Name"
              fullWidth
              required
              value={form.full_name || ''}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            />
            <TextField
              label="Email"
              fullWidth
              required
              type="email"
              value={form.email || ''}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
            {!editTarget && (
              <TextField
                label="Username"
                fullWidth
                required
                value={form.username || ''}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                helperText="Used to log in to the contractor portal"
              />
            )}
            <Autocomplete
              options={companies}
              getOptionLabel={c => c.company_name}
              value={companies.find(c => c.id === form.company_id) || null}
              onChange={(_, val) => setForm(f => ({ ...f, company_id: val?.id || '' }))}
              renderInput={params => <TextField {...params} label="Company" required />}
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={form.role || 'technician'}
                label="Role"
                onChange={e => setForm(f => ({ ...f, role: e.target.value as ExternalUser['role'] }))}
              >
                <MenuItem value="company_admin">Company Admin</MenuItem>
                <MenuItem value="supervisor">Supervisor</MenuItem>
                <MenuItem value="technician">Technician</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </FormControl>
            {!editTarget && (
              <TextField
                label="Temporary Password"
                fullWidth
                type="password"
                value={form.temp_password || ''}
                onChange={e => setForm(f => ({ ...f, temp_password: e.target.value }))}
                helperText="Will be hashed server-side. User must change on first login."
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={form.active ?? true}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  color="success"
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {editTarget ? 'Save Changes' : 'Add User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onClose={closeResetDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password — {resetTarget?.full_name}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            label="New Password"
            fullWidth
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            helperText="Minimum 8 characters. Will be hashed server-side."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><LockResetIcon /></InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleResetPassword}
            disabled={updateMutation.isLoading}
          >
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
