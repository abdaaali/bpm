import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Grid, Card, CardContent, List, ListItemButton, ListItemText,
  TextField, Select, MenuItem, FormControl, InputLabel, Button, Chip, Divider,
  Snackbar, Alert, CircularProgress, Tooltip, Paper, Switch, FormControlLabel,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import EmailIcon from '@mui/icons-material/Email';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { notifApi } from '../../api/client';

const CHANNELS = [
  { value: 'in_app', label: 'In-app only' },
  { value: 'email', label: 'Email only' },
  { value: 'both', label: 'Email + in-app' },
];
const channelColor: Record<string, any> = { in_app: 'default', email: 'info', both: 'success' };

// Sample values used only to render the live preview (mirrors what events provide).
const SAMPLE: Record<string, any> = {
  caseNumber: 'INC1042', title: 'Core link down — site BTS-512', type: 'incident',
  priority: 'critical', siteCode: 'BTS-REMOTE-44', slaDueAt: new Date().toISOString(),
  dueAt: new Date().toISOString(), minutesLeft: 22, mimName: 'Kamal Reda',
  reason: 'Region-wide outage, customer-affecting', decision: 'approved',
  resolutionCode: 'fixed', resolutionNotes: 'Realigned MW dish, link restored',
  taskName: 'Initial Diagnosis', stepName: 'CAB Review', pirNumber: 'PRB1019',
  instanceId: 'a1b2c3', caseId: 'c0ffee',
};

// Compact Handlebars-subset renderer matching the backend helpers
// (upper/lower/date/datetime/if/ifEq) — preview only.
function renderPreview(tpl: string, vars: Record<string, any>): string {
  if (!tpl) return '';
  let s = tpl;
  s = s.replace(/\{\{#ifEq\s+(\w+)\s+"([^"]*)"\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/ifEq\}\}/g,
    (_m, k, val, a, b = '') => (String(vars[k]) === val ? a : b));
  s = s.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_m, k, a, b = '') => (vars[k] ? a : b));
  s = s.replace(/\{\{(upper|lower|date|datetime)\s+(\w+)\}\}/g, (_m, h, k) => {
    const v = vars[k];
    if (v == null) return '';
    if (h === 'upper') return String(v).toUpperCase();
    if (h === 'lower') return String(v).toLowerCase();
    if (h === 'date') return new Date(v).toLocaleDateString();
    return new Date(v).toLocaleString();
  });
  s = s.replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
  return s;
}

// Pull the distinct {{...}} tokens a template references (for the hint chips).
function extractTokens(tpl: string): string[] {
  const out = new Set<string>();
  for (const m of (tpl || '').matchAll(/\{\{[#/]?\s*([^}]+?)\s*\}\}/g)) {
    const t = m[1].trim();
    if (t === 'else' || t.startsWith('/')) continue;
    out.add(t);
  }
  return [...out];
}

export default function NotificationTemplates() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery('notif-templates', () => notifApi.listTemplates());
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', channel: 'in_app', subject: '', body: '', is_active: true });
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  // Select first template once loaded
  useEffect(() => {
    if (!selectedSlug && templates.length) setSelectedSlug(templates[0].slug);
  }, [templates, selectedSlug]);

  // Load the selected template's full body
  const { data: current } = useQuery(
    ['notif-template', selectedSlug],
    () => notifApi.getTemplate(selectedSlug!),
    { enabled: !!selectedSlug },
  );
  useEffect(() => {
    if (current) setForm({ name: current.name || '', channel: current.channel || 'in_app', subject: current.subject || '', body: current.body || '', is_active: current.is_active ?? true });
  }, [current?.id, current?.slug]);

  const saveMut = useMutation(
    () => notifApi.saveTemplate(selectedSlug!, form),
    {
      onSuccess: () => {
        qc.invalidateQueries('notif-templates');
        qc.invalidateQueries(['notif-template', selectedSlug]);
        setSnack({ msg: 'Template saved', sev: 'success' });
      },
      onError: (e: any) => setSnack({ msg: e?.response?.data?.message || 'Save failed', sev: 'error' }),
    },
  );

  const tokens = useMemo(() => extractTokens(`${form.subject} ${form.body}`), [form.subject, form.body]);
  const dirty = current && (form.name !== current.name || form.channel !== current.channel || form.subject !== current.subject || form.body !== current.body || form.is_active !== (current.is_active ?? true));
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (isLoading) return <Box p={4} textAlign="center"><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <NotificationsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Notification Templates</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Edit the messages sent on case, task, approval and SLA events. Bodies use Handlebars
        (<code>{'{{var}}'}</code>, <code>{'{{upper x}}'}</code>, <code>{'{{#if x}}…{{/if}}'}</code>).
      </Typography>

      <Grid container spacing={3}>
        {/* List */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined">
            <List dense disablePadding>
              {templates.map((t: any) => (
                <ListItemButton key={t.slug} selected={t.slug === selectedSlug} onClick={() => setSelectedSlug(t.slug)}>
                  <ListItemText
                    primary={t.name}
                    secondary={t.slug}
                    primaryTypographyProps={{ fontWeight: t.slug === selectedSlug ? 700 : 500, variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Chip size="small" label={t.channel} color={channelColor[t.channel]} variant="outlined"
                    icon={t.channel !== 'in_app' ? <EmailIcon sx={{ fontSize: 14 }} /> : undefined} sx={{ height: 20 }} />
                  {!t.is_active && <Chip size="small" label="Inactive" variant="outlined" sx={{ height: 20, ml: 0.5 }} />}
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Editor */}
        <Grid item xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Editing</Typography>
              <Typography variant="caption" display="block" mb={2} sx={{ fontFamily: 'monospace' }}>{selectedSlug}</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField label="Name" size="small" value={form.name} onChange={set('name')} fullWidth />
                <FormControl size="small" fullWidth>
                  <InputLabel>Channel</InputLabel>
                  <Select label="Channel" value={form.channel} onChange={set('channel')}>
                    {CHANNELS.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />}
                  label={form.is_active ? 'Active' : 'Inactive (delivery suppressed)'}
                />
                <TextField label="Subject" size="small" value={form.subject} onChange={set('subject')} fullWidth />
                <TextField label="Body (HTML + Handlebars)" size="small" value={form.body} onChange={set('body')}
                  fullWidth multiline minRows={8} InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} />
                {tokens.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Variables used</Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                      {tokens.map(t => <Chip key={t} label={t} size="small" sx={{ height: 20, fontFamily: 'monospace' }} />)}
                    </Box>
                  </Box>
                )}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" gap={1}>
                <Button variant="contained" disabled={!dirty || saveMut.isLoading} onClick={() => saveMut.mutate()}>
                  {saveMut.isLoading ? 'Saving…' : 'Save'}
                </Button>
                <Button disabled={!dirty} onClick={() => current && setForm({ name: current.name, channel: current.channel, subject: current.subject, body: current.body, is_active: current.is_active ?? true })}>
                  Reset
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Preview */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                <VisibilityIcon fontSize="small" color="action" />
                <Typography variant="subtitle2">Live Preview</Typography>
                <Tooltip title="Rendered with sample data"><Chip label="sample data" size="small" sx={{ height: 18 }} /></Tooltip>
              </Box>
              <Typography variant="caption" color="text.secondary">Subject</Typography>
              <Typography variant="body2" fontWeight={600} mb={1.5}>{renderPreview(form.subject, SAMPLE) || '—'}</Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="caption" color="text.secondary">Body</Typography>
              <Box sx={{ mt: 0.5, p: 1.5, bgcolor: '#fafafa', borderRadius: 1, border: '1px solid #eee', fontSize: 14, '& p': { my: 0.5 }, '& ul': { my: 0.5, pl: 2.5 } }}
                dangerouslySetInnerHTML={{ __html: renderPreview(form.body, SAMPLE) }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
