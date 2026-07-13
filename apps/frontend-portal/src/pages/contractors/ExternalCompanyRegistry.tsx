import React, { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel,
  Switch, FormControlLabel, Tooltip, Alert, CircularProgress, Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import VerifiedIcon from '@mui/icons-material/Verified';
import PendingIcon from '@mui/icons-material/Pending';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { contractorApi } from '../../api/client';
import BackButton from '../../components/BackButton';

export interface ExternalCompany {
  id: string;
  company_name: string;
  company_type: 'contractor' | 'subcontractor' | 'vendor' | 'partner';
  parent_company_id: string | null;
  parent_company_name?: string;
  qualification_status: 'pending' | 'qualified' | 'disqualified' | 'suspended';
  active: boolean;
  contact_email: string;
  contact_phone: string;
  region_scope: string[];
  capabilities: string[];
  created_at: string;
  updated_at: string;
}

const QUALIFICATION_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  qualified: 'success',
  disqualified: 'error',
  suspended: 'warning',
};

const TYPE_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'info'> = {
  contractor: 'primary',
  subcontractor: 'secondary',
  vendor: 'info',
  partner: 'default',
};

const CAPABILITY_OPTIONS = ['power', 'RAN', 'civil', 'fiber', 'transmission', 'microwave', 'cooling', 'security', 'cabling', 'towers', 'solar', 'generator'];
const REGION_OPTIONS = ['North', 'South', 'East', 'West', 'Central', 'International'];

const emptyForm = (): Partial<ExternalCompany> => ({
  company_name: '',
  company_type: 'contractor',
  parent_company_id: null,
  qualification_status: 'pending',
  active: true,
  contact_email: '',
  contact_phone: '',
  region_scope: [],
  capabilities: [],
});

export default function ExternalCompanyRegistry() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExternalCompany | null>(null);
  const [form, setForm] = useState<Partial<ExternalCompany>>(emptyForm());
  const [error, setError] = useState('');

  const { data: companies = [], isLoading } = useQuery<ExternalCompany[]>(
    'contractor-companies',
    () => contractorApi.getCompanies().then(r => r.data),
  );

  const createMutation = useMutation(
    (dto: Partial<ExternalCompany>) => contractorApi.createCompany(dto),
    {
      onSuccess: () => { qc.invalidateQueries('contractor-companies'); closeDialog(); },
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to create company'),
    },
  );

  const updateMutation = useMutation(
    ({ id, dto }: { id: string; dto: Partial<ExternalCompany> }) => contractorApi.updateCompany(id, dto),
    {
      onSuccess: () => { qc.invalidateQueries('contractor-companies'); closeDialog(); },
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to update company'),
    },
  );

  const openAdd = () => { setEditTarget(null); setForm(emptyForm()); setError(''); setDialogOpen(true); };
  const openEdit = (c: ExternalCompany) => { setEditTarget(c); setForm({ ...c }); setError(''); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditTarget(null); setForm(emptyForm()); setError(''); };

  const handleSubmit = () => {
    if (!form.company_name?.trim()) { setError('Company name is required'); return; }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, dto: form });
    } else {
      createMutation.mutate(form);
    }
  };

  // Stats
  const total = companies.length;
  const active = companies.filter(c => c.active).length;
  const subcontractors = companies.filter(c => c.company_type === 'subcontractor').length;
  const pending = companies.filter(c => c.qualification_status === 'pending').length;

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>External Company Registry</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Company</Button>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Companies', value: total, icon: <BusinessIcon />, color: '#1976d2' },
          { label: 'Active Contractors', value: active, icon: <GroupIcon />, color: '#388e3c' },
          { label: 'Subcontractors', value: subcontractors, icon: <BusinessIcon />, color: '#7b1fa2' },
          { label: 'Pending Qualification', value: pending, icon: <PendingIcon />, color: '#f57c00' },
        ].map(stat => (
          <Grid item xs={12} sm={6} md={3} key={stat.label}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color: stat.color }}>{stat.icon}</Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700} sx={{ color: stat.color }}>{stat.value}</Typography>
                    <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Table */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><b>Company Name</b></TableCell>
                <TableCell><b>Type</b></TableCell>
                <TableCell><b>Parent Company</b></TableCell>
                <TableCell><b>Qualification</b></TableCell>
                <TableCell><b>Active</b></TableCell>
                <TableCell><b>Capabilities</b></TableCell>
                <TableCell><b>Contact</b></TableCell>
                <TableCell><b>Actions</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No companies registered yet. Add the first one.
                  </TableCell>
                </TableRow>
              ) : (
                companies.map(c => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon fontSize="small" color="action" />
                        <Typography variant="body2" fontWeight={600}>{c.company_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={c.company_type} size="small" color={TYPE_COLORS[c.company_type] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {c.parent_company_name || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={c.qualification_status}
                        size="small"
                        color={QUALIFICATION_COLORS[c.qualification_status] || 'default'}
                        icon={c.qualification_status === 'qualified' ? <VerifiedIcon /> : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.active}
                        size="small"
                        onChange={() => updateMutation.mutate({ id: c.id, dto: { active: !c.active } })}
                        color="success"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(c.capabilities || []).slice(0, 3).map(cap => (
                          <Chip key={cap} label={cap} size="small" variant="outlined" />
                        ))}
                        {(c.capabilities || []).length > 3 && (
                          <Chip label={`+${c.capabilities.length - 3}`} size="small" variant="outlined" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{c.contact_email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(c)}>
                          <EditIcon fontSize="small" />
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
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editTarget ? 'Edit Company' : 'Add Company'}</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField
                label="Company Name"
                fullWidth
                required
                value={form.company_name || ''}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={form.company_type || 'contractor'}
                  label="Type"
                  onChange={e => setForm(f => ({ ...f, company_type: e.target.value as ExternalCompany['company_type'] }))}
                >
                  <MenuItem value="contractor">Contractor</MenuItem>
                  <MenuItem value="subcontractor">Subcontractor</MenuItem>
                  <MenuItem value="vendor">Vendor</MenuItem>
                  <MenuItem value="partner">Partner</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={companies.filter(c => c.id !== editTarget?.id)}
                getOptionLabel={c => c.company_name}
                value={companies.find(c => c.id === form.parent_company_id) || null}
                onChange={(_, val) => setForm(f => ({ ...f, parent_company_id: val?.id || null }))}
                renderInput={params => <TextField {...params} label="Parent Company (optional)" />}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Qualification Status</InputLabel>
                <Select
                  value={form.qualification_status || 'pending'}
                  label="Qualification Status"
                  onChange={e => setForm(f => ({ ...f, qualification_status: e.target.value as ExternalCompany['qualification_status'] }))}
                >
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="qualified">Qualified</MenuItem>
                  <MenuItem value="disqualified">Disqualified</MenuItem>
                  <MenuItem value="suspended">Suspended</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Contact Email"
                fullWidth
                type="email"
                value={form.contact_email || ''}
                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Contact Phone"
                fullWidth
                value={form.contact_phone || ''}
                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                freeSolo
                options={REGION_OPTIONS}
                value={form.region_scope || []}
                onChange={(_, val) => setForm(f => ({ ...f, region_scope: val as string[] }))}
                renderTags={(vals, getTagProps) =>
                  vals.map((v, i) => <Chip label={v} {...getTagProps({ index: i })} key={v} size="small" />)
                }
                renderInput={params => <TextField {...params} label="Region Scope" placeholder="Add regions..." />}
              />
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                freeSolo
                options={CAPABILITY_OPTIONS}
                value={form.capabilities || []}
                onChange={(_, val) => setForm(f => ({ ...f, capabilities: val as string[] }))}
                renderTags={(vals, getTagProps) =>
                  vals.map((v, i) => <Chip label={v} {...getTagProps({ index: i })} key={v} size="small" />)
                }
                renderInput={params => <TextField {...params} label="Capabilities" placeholder="Add capabilities (power, RAN, civil...)" />}
              />
            </Grid>
            <Grid item xs={12}>
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
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {editTarget ? 'Save Changes' : 'Add Company'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
