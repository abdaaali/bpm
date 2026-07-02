import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell,
  Paper, Button, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControlLabel, Switch, Tooltip, Snackbar, Alert,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { datahubApi } from '../../api/client';

const DOMAINS = [
  { key: 'vendors',   label: 'Vendors',   hint: 'category, slaHours, escalationEmail, region' },
  { key: 'routes',    label: 'Route Matrix', hint: 'fromCenter, toSiteCode, baseTravelMinutes, roadFactor, securityFactor' },
  { key: 'calendars', label: 'Calendars', hint: 'type (24x7|business_hours), startHour, endHour, blackouts' },
  { key: 'workforce', label: 'Workforce', hint: 'role, skills, region, available' },
  { key: 'spares',    label: 'Spares',    hint: 'partType, quantity, location, reorderLevel' },
];

function DomainTable({ domain, hint }: { domain: string; hint: string }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery(['datahub-domain', domain], () => datahubApi.listDomain(domain));
  const [editing, setEditing] = useState<any | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const dataKeys = useMemo(() => {
    const k = new Set<string>();
    rows.forEach((r: any) => Object.keys(r.data || {}).forEach(x => k.add(x)));
    return [...k];
  }, [rows]);

  const saveMut = useMutation(
    (item: any) => item.id ? datahubApi.updateItem(domain, item.id, item) : datahubApi.createItem(domain, item),
    { onSuccess: () => { qc.invalidateQueries(['datahub-domain', domain]); setEditing(null); setSnack('Saved'); },
      onError: (e: any) => setSnack(e?.response?.data?.message || 'Save failed') },
  );
  const delMut = useMutation((id: string) => datahubApi.deleteItem(domain, id),
    { onSuccess: () => { qc.invalidateQueries(['datahub-domain', domain]); setSnack('Deleted'); } });

  const fmt = (v: any) => Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="caption" color="text.secondary">Fields: {hint}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ code: '', name: '', active: true, data: {} })}>Add</Button>
      </Box>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell><TableCell>Name</TableCell>
              {dataKeys.map(k => <TableCell key={k}>{k}</TableCell>)}
              <TableCell>Active</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                {dataKeys.map(k => <TableCell key={k}>{fmt(r.data?.[k])}</TableCell>)}
                <TableCell>{r.active ? <Chip label="active" size="small" color="success" sx={{ height: 18 }} /> : <Chip label="off" size="small" sx={{ height: 18 }} />}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setEditing({ ...r, data: r.data || {} })}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => window.confirm(`Delete ${r.code}?`) && delMut.mutate(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={dataKeys.length + 4} align="center">No items</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      {editing && (
        <ItemDialog item={editing} hint={hint} onClose={() => setEditing(null)} onSave={(it: any) => saveMut.mutate(it)} saving={saveMut.isLoading} />
      )}
      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack(null)} message={snack || ''} />
    </Box>
  );
}

function ItemDialog({ item, hint, onClose, onSave, saving }: any) {
  const [code, setCode] = useState(item.code || '');
  const [name, setName] = useState(item.name || '');
  const [active, setActive] = useState(item.active ?? true);
  const [dataStr, setDataStr] = useState(JSON.stringify(item.data || {}, null, 2));
  const [err, setErr] = useState('');
  const save = () => {
    let data: any;
    try { data = JSON.parse(dataStr || '{}'); } catch { setErr('Data must be valid JSON'); return; }
    onSave({ ...item, code, name, active, data });
  };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{item.id ? 'Edit' : 'Add'} item</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <TextField label="Code" size="small" value={code} onChange={e => setCode(e.target.value)} fullWidth />
        <TextField label="Name" size="small" value={name} onChange={e => setName(e.target.value)} fullWidth />
        <FormControlLabel control={<Switch checked={active} onChange={e => setActive(e.target.checked)} />} label="Active" />
        <TextField label="Data (JSON)" size="small" value={dataStr} onChange={e => { setDataStr(e.target.value); setErr(''); }}
          fullWidth multiline minRows={6} error={!!err} helperText={err || `Keys: ${hint}`} InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!code || !name || saving} onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

const NEW_SITE = {
  site_code: '', name: '', region: '', access_class: 'urban', support_center: '', sla_class: '',
  base_travel_minutes: 30, max_travel_minutes: 480, access_delay_minutes: 0,
  road_factor: 1, security_factor: 1, seasonal_factor: 1,
  working_hours: '24x7', convoy_required: false, escort_required: false,
};

function SitesTable() {
  const qc = useQueryClient();
  const { data: sites = [] } = useQuery('datahub-sites-admin', () => datahubApi.listSites());
  const [editing, setEditing] = useState<any | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const saveMut = useMutation(
    (s: any) => s.id ? datahubApi.updateSite(s.id, s) : datahubApi.createSite(s),
    { onSuccess: () => { qc.invalidateQueries('datahub-sites-admin'); setEditing(null); setSnack('Saved'); },
      onError: (e: any) => setSnack(e?.response?.data?.message || 'Save failed') },
  );
  const delMut = useMutation((id: string) => datahubApi.deleteSite(id),
    { onSuccess: () => { qc.invalidateQueries('datahub-sites-admin'); setSnack('Deleted'); },
      onError: (e: any) => setSnack(e?.response?.data?.message || 'Delete failed') });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="caption" color="text.secondary">Sites drive the travel-aware Hybrid SLA (travel, road/security/seasonal factors, access &amp; convoy).</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ ...NEW_SITE })}>Add</Button>
      </Box>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead><TableRow>
            {['Code', 'Name', 'Access class', 'Support center', 'Base travel (min)', 'Road', 'Security', 'Convoy', 'SLA class'].map(h => <TableCell key={h}>{h}</TableCell>)}
            <TableCell align="right">Actions</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {sites.map((s: any) => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>{s.site_code}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell><Chip label={s.access_class} size="small" sx={{ height: 18 }} /></TableCell>
                <TableCell>{s.support_center}</TableCell>
                <TableCell>{s.base_travel_minutes}</TableCell>
                <TableCell>{s.road_factor}</TableCell>
                <TableCell>{s.security_factor}</TableCell>
                <TableCell>{s.convoy_required ? 'yes' : 'no'}</TableCell>
                <TableCell>{s.sla_class}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setEditing({ ...s })}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => window.confirm(`Delete site ${s.site_code}?`) && delMut.mutate(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!sites.length && <TableRow><TableCell colSpan={10} align="center">No sites</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      {editing && (
        <SiteDialog site={editing} onClose={() => setEditing(null)} onSave={(s: any) => saveMut.mutate(s)} saving={saveMut.isLoading} />
      )}
      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack(null)} message={snack || ''} />
    </Box>
  );
}

function SiteDialog({ site, onClose, onSave, saving }: any) {
  const isEdit = !!site.id;
  const [f, setF] = useState<any>({ ...site });
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }));
  const setNum = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const setBool = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.checked }));
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit' : 'Add'} site</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <Box display="flex" gap={2}>
          <TextField label="Site code" size="small" value={f.site_code || ''} onChange={set('site_code')} disabled={isEdit} fullWidth helperText={isEdit ? 'Code cannot be changed' : ' '} />
          <TextField label="Name" size="small" value={f.name || ''} onChange={set('name')} fullWidth />
        </Box>
        <Box display="flex" gap={2}>
          <TextField label="Region" size="small" value={f.region || ''} onChange={set('region')} fullWidth />
          <TextField label="Access class" size="small" value={f.access_class || ''} onChange={set('access_class')} fullWidth />
        </Box>
        <Box display="flex" gap={2}>
          <TextField label="Support center" size="small" value={f.support_center || ''} onChange={set('support_center')} fullWidth />
          <TextField label="SLA class" size="small" value={f.sla_class || ''} onChange={set('sla_class')} fullWidth />
        </Box>
        <Box display="flex" gap={2}>
          <TextField label="Base travel (min)" type="number" size="small" value={f.base_travel_minutes ?? ''} onChange={setNum('base_travel_minutes')} fullWidth />
          <TextField label="Max travel (min)" type="number" size="small" value={f.max_travel_minutes ?? ''} onChange={setNum('max_travel_minutes')} fullWidth />
          <TextField label="Access delay (min)" type="number" size="small" value={f.access_delay_minutes ?? ''} onChange={setNum('access_delay_minutes')} fullWidth />
        </Box>
        <Box display="flex" gap={2}>
          <TextField label="Road factor" type="number" size="small" value={f.road_factor ?? ''} onChange={setNum('road_factor')} fullWidth />
          <TextField label="Security factor" type="number" size="small" value={f.security_factor ?? ''} onChange={setNum('security_factor')} fullWidth />
          <TextField label="Seasonal factor" type="number" size="small" value={f.seasonal_factor ?? ''} onChange={setNum('seasonal_factor')} fullWidth />
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          <TextField label="Working hours" size="small" value={f.working_hours || ''} onChange={set('working_hours')} sx={{ flex: 1 }} />
          <FormControlLabel control={<Switch checked={!!f.convoy_required} onChange={setBool('convoy_required')} />} label="Convoy" />
          <FormControlLabel control={<Switch checked={!!f.escort_required} onChange={setBool('escort_required')} />} label="Escort" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!f.site_code || !f.name || saving} onClick={() => onSave(f)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DataHub() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <StorageIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Operational DataHub</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Reference data driving routing and the travel-aware SLA. The Route Matrix refines the Hybrid SLA travel allowance per site.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        <Tab label="Sites" />
        {DOMAINS.map(d => <Tab key={d.key} label={d.label} />)}
      </Tabs>
      {tab === 0 && <SitesTable />}
      {DOMAINS.map((d, i) => tab === i + 1 && <DomainTable key={d.key} domain={d.key} hint={d.hint} />)}
    </Box>
  );
}
