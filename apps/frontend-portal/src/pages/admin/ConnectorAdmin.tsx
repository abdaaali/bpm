import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  MenuItem, Select, FormControl, InputLabel, Table, TableHead, TableBody,
  TableRow, TableCell, IconButton, Tooltip, Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { connectorApi } from '../../api/client';
import { format } from 'date-fns';

export default function ConnectorAdmin() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [logs, setLogs] = useState<any>(null);
  const [snack, setSnack] = useState('');
  const [form, setForm] = useState({ name: '', type: 'rest', url: '', method: 'POST', topic: '', schedule: '' });
  const [error, setError] = useState('');

  const { data } = useQuery('connectors', () => connectorApi.list(1, 100));

  const create = useMutation(
    () => {
      const cfg: any = {};
      if (form.type === 'rest' || form.type === 'webhook') { cfg.url = form.url; cfg.method = form.method; }
      if (form.type === 'kafka_producer') { cfg.topic = form.topic; }
      const trigCfg: any = {};
      if (form.type === 'cron') { trigCfg.schedule = form.schedule; cfg.url = form.url; cfg.method = form.method || 'GET'; }
      return connectorApi.create({ name: form.name, type: form.type, config: cfg, trigger_config: trigCfg });
    },
    {
      onSuccess: () => { qc.invalidateQueries('connectors'); setCreating(false); setForm({ name: '', type: 'rest', url: '', method: 'POST', topic: '', schedule: '' }); },
      onError: (e: any) => setError(e.response?.data?.message || e.message),
    },
  );

  const activate = useMutation((id: string) => connectorApi.activate(id), {
    onSuccess: () => { qc.invalidateQueries('connectors'); setSnack('Connector activated'); },
  });
  const deactivate = useMutation((id: string) => connectorApi.deactivate(id), {
    onSuccess: () => { qc.invalidateQueries('connectors'); setSnack('Connector deactivated'); },
  });
  const execute = useMutation((id: string) => connectorApi.execute(id, {}), {
    onSuccess: () => setSnack('Executed successfully'),
    onError: (e: any) => setSnack(`Execution failed: ${(e as any).message}`),
  });

  const fetchLogs = async (id: string) => {
    const data = await connectorApi.getLogs(id);
    setLogs(data);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Integration Connectors</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New Connector</Button>
      </Box>

      <Grid container spacing={3}>
        {data?.data?.map((c: any) => (
          <Grid item xs={12} sm={6} md={4} key={c.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Typography variant="h6">{c.name}</Typography>
                  <Chip label={c.status} size="small" color={c.status === 'active' ? 'success' : 'default'} />
                </Box>
                <Chip label={c.type} size="small" sx={{ mt: 1 }} />
                {c.last_run_at && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    Last run: {format(new Date(c.last_run_at), 'dd MMM HH:mm')} · {c.last_run_status}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                {c.status === 'active' ? (
                  <Tooltip title="Deactivate"><IconButton size="small" onClick={() => deactivate.mutate(c.id)}><PauseIcon /></IconButton></Tooltip>
                ) : (
                  <Tooltip title="Activate"><IconButton size="small" onClick={() => activate.mutate(c.id)}><PlayArrowIcon color="success" /></IconButton></Tooltip>
                )}
                <Tooltip title="Test Execute"><IconButton size="small" onClick={() => execute.mutate(c.id)}><PlayArrowIcon color="info" /></IconButton></Tooltip>
                <Tooltip title="View Logs"><IconButton size="small" onClick={() => fetchLogs(c.id)}><ListAltIcon /></IconButton></Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
        {!data?.data?.length && (
          <Grid item xs={12}>
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No connectors yet. Create one to start integrating!</Typography>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Create Connector */}
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Connector</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField required label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select value={form.type} label="Type" onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <MenuItem value="rest">REST</MenuItem>
              <MenuItem value="webhook">Webhook</MenuItem>
              <MenuItem value="kafka_producer">Kafka Producer</MenuItem>
              <MenuItem value="cron">Cron</MenuItem>
            </Select>
          </FormControl>
          {(form.type === 'rest' || form.type === 'webhook' || form.type === 'cron') && (
            <>
              <TextField required label="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              <FormControl fullWidth>
                <InputLabel>HTTP Method</InputLabel>
                <Select value={form.method} label="HTTP Method" onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                  {['GET','POST','PUT','PATCH','DELETE'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          )}
          {form.type === 'kafka_producer' && (
            <TextField required label="Kafka Topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
          )}
          {form.type === 'cron' && (
            <TextField label="Schedule (e.g. every_30m, every_1h)" value={form.schedule}
              onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.name || create.isLoading} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={!!logs} onClose={() => setLogs(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Connector Logs</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Time</TableCell><TableCell>Triggered By</TableCell>
              <TableCell>Status</TableCell><TableCell>Duration</TableCell><TableCell>Error</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {logs?.data?.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{format(new Date(l.created_at), 'dd MMM HH:mm:ss')}</TableCell>
                  <TableCell>{l.triggered_by}</TableCell>
                  <TableCell><Chip label={l.status} size="small" color={l.status === 'success' ? 'success' : 'error'} /></TableCell>
                  <TableCell>{l.duration_ms}ms</TableCell>
                  <TableCell sx={{ maxWidth: 200 }}><Typography variant="caption" noWrap>{l.error_message || '—'}</Typography></TableCell>
                </TableRow>
              ))}
              {!logs?.data?.length && <TableRow><TableCell colSpan={5} align="center">No logs</TableCell></TableRow>}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions><Button onClick={() => setLogs(null)}>Close</Button></DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
