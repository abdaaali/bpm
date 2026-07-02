import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, Button, TextField, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, TablePagination, CircularProgress, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  FormControl, InputLabel, Select, MenuItem, Alert, Switch, FormControlLabel,
  Divider, Grid, Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SearchIcon from '@mui/icons-material/Search';
import { mdmApi } from '../../api/client';

const COMMON_TIMEZONES = [
  'UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland',
];

const EMPTY_HOST = {
  host_name: '', ip_address: '', site_id: '', canonical_site_id: '',
  region: '', cluster: '', vendor: '', technology_domain: '',
  assignment_group: '', oncall_group: '', sla_class: '',
  location_path: '', sla_profile_id: '', sla_calendar_id: '', sla_timezone: 'UTC',
  response_time_minutes: '', onsite_time_minutes: '', restore_time_minutes: '',
  travel_time_minutes: '', access_time_minutes: '',
  access_restrictions: '', notes: '', is_active: true,
};

// Autocomplete with freeSolo for fields that should suggest existing values but allow new ones
function FreeSoloField({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; required?: boolean;
}) {
  return (
    <Autocomplete
      freeSolo
      options={options}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      renderInput={(params) => (
        <TextField {...params} size="small" label={label} required={required} />
      )}
    />
  );
}

function HostDialog({ open, host, onClose, onSave, saving, error, filterOpts }: any) {
  const [form, setForm] = useState<any>(host ? { ...host } : { ...EMPTY_HOST });
  const isNew = !host?.id;

  React.useEffect(() => {
    setForm(host ? { ...host } : { ...EMPTY_HOST });
  }, [host, open]);

  const set    = (field: string) => (v: string) => setForm((p: any) => ({ ...p, [field]: v }));
  const setRaw = (field: string) => (e: any)    => setForm((p: any) => ({ ...p, [field]: e.target.value }));
  const setNum = (field: string) => (e: any) =>
    setForm((p: any) => ({ ...p, [field]: e.target.value === '' ? null : Number(e.target.value) }));

  const opts = filterOpts || {};

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isNew ? 'Add Host' : `Edit Host: ${form.host_name}`}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>

          {/* Identity */}
          <Grid item xs={12} sm={6}>
            <TextField fullWidth required size="small" label="Host Name"
              value={form.host_name} onChange={setRaw('host_name')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth size="small" label="IP Address"
              value={form.ip_address || ''} onChange={setRaw('ip_address')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth size="small" label="Site ID"
              value={form.site_id || ''} onChange={setRaw('site_id')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth size="small" label="Canonical Site ID"
              value={form.canonical_site_id || ''} onChange={setRaw('canonical_site_id')} />
          </Grid>

          {/* Classification — freeSolo dropdowns populated from existing values */}
          <Grid item xs={12} sm={4}>
            <FreeSoloField label="Region" value={form.region || ''}
              onChange={set('region')} options={opts.regions || []} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FreeSoloField label="Cluster" value={form.cluster || ''}
              onChange={set('cluster')} options={opts.clusters || []} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FreeSoloField label="Vendor" value={form.vendor || ''}
              onChange={set('vendor')} options={opts.vendors || []} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FreeSoloField label="Technology Domain" value={form.technology_domain || ''}
              onChange={set('technology_domain')} options={opts.technology_domains || []} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FreeSoloField label="SLA Class" value={form.sla_class || ''}
              onChange={set('sla_class')} options={opts.sla_classes || []} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FreeSoloField label="Assignment Group" value={form.assignment_group || ''}
              onChange={set('assignment_group')} options={opts.assignment_groups || []} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FreeSoloField label="On-Call Group" value={form.oncall_group || ''}
              onChange={set('oncall_group')} options={opts.oncall_groups || []} />
          </Grid>

          <Grid item xs={12}>
            <Divider><Typography variant="caption" color="text.secondary">SLA Settings</Typography></Divider>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="SLA Profile ID"
              value={form.sla_profile_id || ''} onChange={setRaw('sla_profile_id')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth size="small" label="SLA Calendar ID"
              value={form.sla_calendar_id || ''} onChange={setRaw('sla_calendar_id')} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FreeSoloField label="SLA Timezone" value={form.sla_timezone || 'UTC'}
              onChange={set('sla_timezone')} options={COMMON_TIMEZONES} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth size="small" type="number" label="Response Time (min)"
              value={form.response_time_minutes ?? ''} onChange={setNum('response_time_minutes')} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth size="small" type="number" label="Onsite Time (min)"
              value={form.onsite_time_minutes ?? ''} onChange={setNum('onsite_time_minutes')} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth size="small" type="number" label="Restore Time (min)"
              value={form.restore_time_minutes ?? ''} onChange={setNum('restore_time_minutes')} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth size="small" type="number" label="Travel Time (min)"
              value={form.travel_time_minutes ?? ''} onChange={setNum('travel_time_minutes')} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField fullWidth size="small" type="number" label="Access Time (min)"
              value={form.access_time_minutes ?? ''} onChange={setNum('access_time_minutes')} />
          </Grid>

          <Grid item xs={12}><Divider /></Grid>

          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Location Path"
              value={form.location_path || ''} onChange={setRaw('location_path')} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Access Restrictions"
              value={form.access_restrictions || ''} onChange={setRaw('access_restrictions')} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" multiline rows={2} label="Notes"
              value={form.notes || ''} onChange={setRaw('notes')} />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={<Switch checked={!!form.is_active}
                onChange={e => setForm((p: any) => ({ ...p, is_active: e.target.checked }))} />}
              label="Active" />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saving || !form.host_name.trim()}
          onClick={() => onSave(form)}>
          {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, host, onClose, onConfirm, deleting }: any) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Host</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{host?.host_name}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={deleting} onClick={onConfirm}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MdmHosts() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');

  const [editHost, setEditHost] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteHost, setDeleteHost] = useState<any>(null);

  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  const { data, isLoading } = useQuery(
    ['mdm-hosts', page, search, regionFilter, domainFilter],
    () => mdmApi.list(
      { search: search || undefined, region: regionFilter || undefined, technology_domain: domainFilter || undefined },
      page + 1, pageSize,
    ),
    { keepPreviousData: true },
  );

  const { data: filterOpts } = useQuery('mdm-filter-opts', () => mdmApi.filterOptions(), { staleTime: 60_000 });

  const saveMutation = useMutation(
    (form: any) => form.id ? mdmApi.update(form.id, form) : mdmApi.create(form),
    {
      onSuccess: () => {
        qc.invalidateQueries('mdm-hosts');
        qc.invalidateQueries('mdm-filter-opts'); // refresh dropdown options after save
        setEditOpen(false);
        setEditError('');
      },
      onError: (e: any) => setEditError(e.response?.data?.message || e.message || 'Save failed'),
    },
  );

  const deleteMutation = useMutation(
    (id: string) => mdmApi.remove(id),
    { onSuccess: () => { qc.invalidateQueries('mdm-hosts'); setDeleteHost(null); } },
  );

  const handleExport = async () => {
    try {
      const res = await fetch(mdmApi.exportUrl(), {
        headers: { Authorization: `Bearer ${localStorage.getItem('kc_token') || ''}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'mdm_hosts.json'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      const hosts = await mdmApi.list({}, 1, 10000);
      const blob = new Blob([JSON.stringify(hosts.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'mdm_hosts.json'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(''); setImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const hosts = Array.isArray(parsed) ? parsed : parsed.data || parsed.hosts || [];
      if (!hosts.length) { setImportError('No hosts found in file'); return; }
      const result = await mdmApi.importHosts(hosts);
      setImportResult(result);
      qc.invalidateQueries('mdm-hosts');
      qc.invalidateQueries('mdm-filter-opts');
    } catch (err: any) {
      setImportError(err.response?.data?.message || err.message || 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openAdd  = () => { setEditHost(null); setEditError(''); setEditOpen(true); };
  const openEdit = (h: any) => { setEditHost(h); setEditError(''); setEditOpen(true); };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">MDM Hosts</Typography>
        <Box display="flex" gap={1}>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
          <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport}>
            Export JSON
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            Add Host
          </Button>
        </Box>
      </Box>

      {importResult && (
        <Alert severity={importResult.errors?.length ? 'warning' : 'success'} sx={{ mb: 2 }}
          onClose={() => setImportResult(null)}>
          Imported {importResult.imported} host(s).
          {importResult.errors?.length > 0 &&
            ` ${importResult.errors.length} error(s): ${importResult.errors.slice(0, 3).join('; ')}`}
        </Alert>
      )}
      {importError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError('')}>{importError}</Alert>}

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <Box p={2} display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            size="small" placeholder="Search host, site, IP…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Region</InputLabel>
            <Select value={regionFilter} label="Region"
              onChange={e => { setRegionFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              {(filterOpts?.regions || []).map((r: string) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Technology</InputLabel>
            <Select value={domainFilter} label="Technology"
              onChange={e => { setDomainFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              {(filterOpts?.technology_domains || []).map((d: string) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Card>

      <Card>
        {isLoading ? (
          <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Host Name</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Site ID</TableCell>
                  <TableCell>Region</TableCell>
                  <TableCell>Technology</TableCell>
                  <TableCell>SLA Class</TableCell>
                  <TableCell>Assignment Group</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.data?.map((h: any) => (
                  <TableRow key={h.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{h.host_name}</Typography></TableCell>
                    <TableCell>{h.ip_address || '—'}</TableCell>
                    <TableCell>{h.site_id || '—'}</TableCell>
                    <TableCell>{h.region || '—'}</TableCell>
                    <TableCell>{h.technology_domain || '—'}</TableCell>
                    <TableCell>{h.sla_class ? <Chip label={h.sla_class} size="small" /> : '—'}</TableCell>
                    <TableCell>{h.assignment_group || '—'}</TableCell>
                    <TableCell>
                      <Chip label={h.is_active ? 'Active' : 'Inactive'} size="small"
                        color={h.is_active ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(h)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteHost(h)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.data?.length && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      No hosts found. Add hosts or import from JSON.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div" count={data?.total || 0} page={page} rowsPerPage={pageSize}
              onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]} />
          </>
        )}
      </Card>

      <HostDialog
        open={editOpen}
        host={editHost}
        filterOpts={filterOpts}
        onClose={() => setEditOpen(false)}
        onSave={(form: any) => { setEditError(''); saveMutation.mutate(form); }}
        saving={saveMutation.isLoading}
        error={editError}
      />

      <DeleteDialog
        open={!!deleteHost}
        host={deleteHost}
        onClose={() => setDeleteHost(null)}
        onConfirm={() => deleteMutation.mutate(deleteHost.id)}
        deleting={deleteMutation.isLoading}
      />
    </Box>
  );
}
