import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, Button, Tabs, Tab, Chip, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Paper,
  TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Switch,
  Checkbox, IconButton, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useAccess } from '../../auth/useAccess';
import { digestApi } from '../../api/client';
import BackButton from '../../components/BackButton';

const STATUS_COLOR: Record<string, any> = { SENT: 'success', FAILED: 'error', Active: 'success', Paused: 'default' };

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: any }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: .5 }}>{label}</Typography>
        <Box mt={0.5}>{typeof value === 'string' && color
          ? <Chip size="small" label={value} color={STATUS_COLOR[value] || color} />
          : <Typography variant="h6" fontWeight={700}>{value}</Typography>}</Box>
      </CardContent>
    </Card>
  );
}

export default function ManagementDigest() {
  const qc = useQueryClient();
  const { can } = useAccess();
  const canManage = can('notifications:manage');
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [viewRun, setViewRun] = useState<any | null>(null);
  const [newEmail, setNewEmail] = useState('');

  const overview = useQuery('digest-overview', digestApi.overview);
  const config = useQuery('digest-config', digestApi.getConfig);
  const recipients = useQuery('digest-recipients', digestApi.recipients);
  const runs = useQuery('digest-runs', digestApi.runs);

  const previewMut = useMutation(digestApi.preview, {
    onSuccess: (d) => setPreview(d), onError: (e: any) => setError(e.response?.data?.message || e.message),
  });
  const sendMut = useMutation(() => digestApi.send({ type: 'MANUAL_SEND' }), {
    onSuccess: () => { qc.invalidateQueries('digest-runs'); qc.invalidateQueries('digest-overview'); },
    onError: (e: any) => setError(e.response?.data?.message || e.message),
  });
  const saveCfgMut = useMutation((dto: any) => digestApi.updateConfig(dto), {
    onSuccess: () => { qc.invalidateQueries('digest-config'); qc.invalidateQueries('digest-overview'); },
    onError: (e: any) => setError(e.response?.data?.message || e.message),
  });
  const addRecMut = useMutation((email: string) => digestApi.addRecipient({ email }), {
    onSuccess: () => { qc.invalidateQueries('digest-recipients'); setNewEmail(''); },
    onError: (e: any) => setError(e.response?.data?.message || e.message),
  });
  const delRecMut = useMutation((id: string) => digestApi.removeRecipient(id), {
    onSuccess: () => qc.invalidateQueries('digest-recipients'),
  });

  // Local editable config (kept in sync once loaded).
  const cfg = config.data;
  const [draft, setDraft] = useState<any>(null);
  React.useEffect(() => { if (cfg && !draft) setDraft({ enabled: cfg.enabled, channel: cfg.channel, scheduleType: cfg.scheduleType, sections: cfg.sections }); }, [cfg, draft]);
  const updateDraft = (patch: any) => setDraft((d: any) => ({ ...d, ...patch }));
  const toggleSection = (key: string) =>
    setDraft((d: any) => ({ ...d, sections: d.sections.includes(key) ? d.sections.filter((s: string) => s !== key) : [...d.sections, key] }));

  const o = overview.data;

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box mb={2}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Typography variant="h5" fontWeight={800}>Weekly Management Digest</Typography>
          {o && <Chip size="small" label={o.scheduleStatus} color={STATUS_COLOR[o.scheduleStatus] || 'default'} />}
        </Box>
        <Typography variant="body2" color="text.secondary">
          Automated governance reporting — scheduled delivery to management recipients
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab icon={<MailOutlineIcon fontSize="small" />} iconPosition="start" label="Overview" />
        <Tab icon={<SettingsIcon fontSize="small" />} iconPosition="start" label="Configuration" />
        <Tab icon={<PeopleIcon fontSize="small" />} iconPosition="start" label="Recipients" />
        <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="start" label="Run History" />
      </Tabs>

      {/* ── Overview ── */}
      {tab === 0 && (
        overview.isLoading || !o ? <CircularProgress /> : (
          <Box>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}><StatCard label="Schedule Status" value={o.scheduleStatus} color="success" /></Grid>
              <Grid item xs={12} sm={6} md={3}><StatCard label="Delivery Channel" value={o.deliveryChannel} /></Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard label="Last Run" value={o.lastRun
                  ? <Stack spacing={0.5}><Chip size="small" label={o.lastRun.status} color={STATUS_COLOR[o.lastRun.status] || 'default'} />
                      <Typography variant="caption" color="text.secondary">{new Date(o.lastRun.at).toLocaleString()}</Typography></Stack>
                  : '—'} />
              </Grid>
              <Grid item xs={12} sm={6} md={3}><StatCard label="SMTP Configured" value={o.smtpConfigured ? 'Yes' : 'No'} color={o.smtpConfigured ? 'success' : 'warning'} /></Grid>
            </Grid>

            <Card variant="outlined" sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Manual Actions</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Generate a one-off preview, or generate and deliver the digest immediately. Scheduled delivery is {o.scheduleLabel}.
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button variant="outlined" startIcon={<VisibilityIcon />} disabled={previewMut.isLoading} onClick={() => previewMut.mutate()}>
                    Generate Preview
                  </Button>
                  {canManage && (
                    <Button variant="contained" disabled={sendMut.isLoading} onClick={() => sendMut.mutate()}>
                      ▶️ {sendMut.isLoading ? 'Sending…' : 'Generate & Send Now'}
                    </Button>
                  )}
                </Stack>
                {sendMut.isSuccess && <Alert severity="success" sx={{ mt: 2 }}>Digest generated and dispatched. See Run History.</Alert>}
              </CardContent>
            </Card>
          </Box>
        )
      )}

      {/* ── Configuration ── */}
      {tab === 1 && (
        config.isLoading || !draft ? <CircularProgress /> : (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700}>Digest Configuration</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Configure schedule, delivery channel, and content sections for the weekly digest.
              </Typography>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>General Settings</Typography>
              <FormControlLabel
                control={<Switch checked={draft.enabled} onChange={(e) => updateDraft({ enabled: e.target.checked })} disabled={!canManage} />}
                label={<Box><Typography variant="body2" fontWeight={600}>Enable Weekly Digest</Typography>
                  <Typography variant="caption" color="text.secondary">Automatically generate and send the digest.</Typography></Box>}
              />

              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} sm={6}>
                  <FormControl size="small" fullWidth disabled={!canManage}>
                    <InputLabel>Delivery Channel</InputLabel>
                    <Select label="Delivery Channel" value={draft.channel} onChange={(e) => updateDraft({ channel: e.target.value })}>
                      <MenuItem value="email">Email</MenuItem>
                      <MenuItem value="in_app">In-App</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl size="small" fullWidth disabled={!canManage}>
                    <InputLabel>Schedule Type</InputLabel>
                    <Select label="Schedule Type" value={draft.scheduleType} onChange={(e) => updateDraft({ scheduleType: e.target.value })}>
                      <MenuItem value="weekly_monday_8">Weekly (Monday 8:00 AM)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3 }}>Included Sections</Typography>
              <Box>
                {(cfg?.availableSections || []).map((s: any) => (
                  <FormControlLabel key={s.key}
                    control={<Checkbox checked={draft.sections.includes(s.key)} onChange={() => toggleSection(s.key)} disabled={!canManage} />}
                    label={s.label} sx={{ display: 'block' }} />
                ))}
              </Box>

              {canManage && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Button variant="contained" disabled={saveCfgMut.isLoading} onClick={() => saveCfgMut.mutate(draft)}>
                    {saveCfgMut.isLoading ? 'Saving…' : 'Save Configuration'}
                  </Button>
                  {saveCfgMut.isSuccess && <Chip size="small" color="success" label="Saved" sx={{ ml: 2 }} />}
                </>
              )}
            </CardContent>
          </Card>
        )
      )}

      {/* ── Recipients ── */}
      {tab === 2 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700}>Digest Recipients</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Manage email recipients for the weekly management digest.
            </Typography>

            {canManage && (
              <Stack direction="row" spacing={1} mb={2}>
                <TextField size="small" placeholder="email@example.com" type="email" value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newEmail.trim()) addRecMut.mutate(newEmail.trim()); }}
                  sx={{ minWidth: 280 }} />
                <Button variant="contained" startIcon={<AddIcon />} disabled={!newEmail.trim() || addRecMut.isLoading}
                  onClick={() => addRecMut.mutate(newEmail.trim())}>Add Recipient</Button>
              </Stack>
            )}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Added At</TableCell>
                    {canManage && <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(recipients.data || []).map((r: any) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.email}</TableCell>
                      <TableCell><Chip size="small" label={String(r.type).toUpperCase()} variant="outlined" /></TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Tooltip title="Remove">
                            <IconButton size="small" color="error" onClick={() => delRecMut.mutate(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!recipients.isLoading && !(recipients.data || []).length && (
                    <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary" py={2}>No recipients yet.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Run History ── */}
      {tab === 3 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700}>Digest Run History</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>All generated and delivered digest runs.</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Run Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(runs.data || []).map((r: any) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{r.run_code}</TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={r.type} /></TableCell>
                      <TableCell><Chip size="small" label={r.status} color={STATUS_COLOR[r.status] || 'default'} /></TableCell>
                      <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={async () => { try { setViewRun(await digestApi.getRun(r.id)); } catch (e: any) { setError(e.message); } }}>View →</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!runs.isLoading && !(runs.data || []).length && (
                    <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary" py={2}>No runs yet. Use “Generate & Send Now” on the Overview tab.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md" fullWidth>
        <DialogTitle>{preview?.subject || 'Digest Preview'}</DialogTitle>
        <DialogContent dividers><Box dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || '' }} /></DialogContent>
        <DialogActions><Button onClick={() => setPreview(null)}>Close</Button></DialogActions>
      </Dialog>

      {/* Run view dialog */}
      <Dialog open={!!viewRun} onClose={() => setViewRun(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewRun?.subject || 'Digest Run'}
          {viewRun && <Chip size="small" sx={{ ml: 1 }} label={viewRun.status} color={STATUS_COLOR[viewRun.status] || 'default'} />}
        </DialogTitle>
        <DialogContent dividers>
          {viewRun?.error && <Alert severity="error" sx={{ mb: 2 }}>{viewRun.error}</Alert>}
          <Typography variant="caption" color="text.secondary">
            {viewRun?.run_code} · {viewRun?.type} · {(viewRun?.recipients || []).length} recipient(s)
          </Typography>
          <Box mt={2} dangerouslySetInnerHTML={{ __html: viewRun?.body_html || '' }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setViewRun(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
