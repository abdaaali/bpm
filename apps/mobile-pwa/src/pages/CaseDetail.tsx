import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, IconButton, Typography, Card, CardContent, Chip, Button, Stack,
  CircularProgress, Snackbar, Divider, TextField, FormControlLabel, Switch, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, MenuItem,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import { api } from '../api';
import { useAuth } from '../auth';

// The single forward step offered at each status (mobile). One action at a time
// so the flow is sequential: claim → begin work → resolve → close.
const NEXT: Record<string, string[]> = {
  new: ['in_progress'], open: ['in_progress'], pending: ['in_progress'], approved: ['in_progress'],
  in_progress: ['resolved'], resolved: ['closed'], pending_approval: [],
};
const PRIO: Record<string, any> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };
const ASSIGN_ROLES = ['admin', 'manager', 'noc'];

function fmtDate(s?: string) { return s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function slaText(c: any): { text: string; color: any } | null {
  if (c.breached) return { text: 'SLA breached', color: 'error' };
  if (c.sla_at_risk) return { text: 'SLA at risk', color: 'warning' };
  if (!c.sla_due_at) return null;
  const h = Math.round((new Date(c.sla_due_at).getTime() - Date.now()) / 3.6e6);
  if (h <= 0) return { text: 'SLA overdue', color: 'error' };
  return { text: h < 24 ? `SLA due in ${h}h` : `SLA due in ${Math.round(h / 24)}d`, color: 'default' };
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-word' }}>{value || '—'}</Typography>
    </Box>
  );
}

export default function CaseDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [note, setNote] = useState(''); const [internal, setInternal] = useState(true);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [reOpen, setReOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]); const [teams, setTeams] = useState<any[]>([]);
  const [pickUser, setPickUser] = useState<any>(null); const [pickTeam, setPickTeam] = useState<string>('');

  const canAssign = (user?.roles || []).some((r: string) => ASSIGN_ROLES.includes(r));

  const load = () => api.get(`/cases/${id}`).then((r) => setC(r.data)).catch(() => setMsg('Failed to load'));
  const loadComments = () => api.get(`/cases/${id}/comments?internal=true`).then((r) => setComments(Array.isArray(r.data) ? r.data : r.data?.data || [])).catch(() => {});
  useEffect(() => { load(); loadComments(); }, [id]);

  const transition = async (status: string) => {
    setBusy(true);
    try {
      const body: any = { status, expected_version: c.version };
      if (status === 'resolved') { body.resolution_code = 'fixed'; body.resolution_notes = note.trim() || 'Resolved from mobile'; }
      await api.patch(`/cases/${id}/transition`, body); setMsg(`Moved to ${status.replace('_', ' ')}`); load(); loadComments();
    } catch (e: any) { setMsg(e?.response?.data?.message || 'Action failed'); } finally { setBusy(false); }
  };

  const claim = async () => {
    setBusy(true);
    try { await api.post(`/cases/${id}/claim`); setMsg('Claimed — assigned to you'); load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Claim failed'); } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/cases/${id}/comments`, { body: note.trim(), internal });
      setNote(''); setMsg('Note added'); loadComments();
    } catch (e: any) { setMsg(e?.response?.data?.message || 'Could not add note'); } finally { setBusy(false); }
  };

  const openReassign = async () => {
    setReOpen(true);
    setPickTeam(c.assigned_team_id || ''); // preserve current team unless changed
    if (!users.length) {
      try {
        const [u, o] = await Promise.all([api.get('/users'), api.get('/org-units')]);
        const ud = Array.isArray(u.data) ? u.data : u.data?.data || [];
        const od = Array.isArray(o.data) ? o.data : o.data?.data || [];
        setUsers(ud.filter((x: any) => x.active !== false));
        setTeams(od.filter((x: any) => x.type === 'team'));
      } catch { setMsg('Could not load people'); }
    }
  };

  const doReassign = async () => {
    if (!pickUser && !pickTeam) { setReOpen(false); return; }
    setBusy(true);
    try {
      await api.patch(`/cases/${id}/assign`, { assigneeId: pickUser?.id || null, teamId: pickTeam || null });
      setMsg('Case reassigned'); setReOpen(false); setPickUser(null); setPickTeam(''); load();
    } catch (e: any) { setMsg(e?.response?.data?.message || 'Reassign failed'); } finally { setBusy(false); }
  };

  if (!c) return <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress /></Box>;
  // Work actions only when the case is assigned to ME. Unassigned → claim first;
  // assigned to someone else → no work actions (a manager can still reassign).
  const mine = !!c.mine;
  const actions = (c.assignee_id && mine) ? (NEXT[c.status] || []) : [];
  const sla = slaText(c);
  const ctx = c.context || {};
  const ci = ctx.affectedService || ctx.affectedHostId || ctx.siteCode || ctx.ciName;

  return (
    <Box sx={{ pb: 6 }}>
      <AppBar position="sticky"><Toolbar variant="dense">
        <IconButton color="inherit" edge="start" onClick={() => nav(-1)}><ArrowBackIcon /></IconButton>
        <Typography variant="h6">{c.case_number}</Typography>
      </Toolbar></AppBar>

      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>{c.title}</Typography>
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
          <Chip label={c.type} size="small" />
          <Chip label={c.priority} size="small" color={PRIO[c.priority]} />
          <Chip label={String(c.status).replace(/_/g, ' ')} size="small" variant="outlined" />
          {c.major_incident && <Chip label="MAJOR" size="small" color="error" />}
          {sla && <Chip label={sla.text} size="small" color={sla.color} variant={sla.color === 'default' ? 'outlined' : 'filled'} />}
        </Stack>

        {/* Details */}
        <Card sx={{ mb: 2 }}><CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 1.5, columnGap: 2 }}>
            <Field label="Assigned team" value={c.team_name} />
            <Field label="Assignee" value={c.assignee_name || 'Unassigned'} />
            <Field label="Requested by" value={c.requester_name} />
            <Field label="Created" value={fmtDate(c.created_at)} />
            {(c.impact || c.urgency) && <Field label="Impact / Urgency" value={`${c.impact || '—'} / ${c.urgency || '—'}`} />}
            {ci && <Field label="Affected CI / Site" value={ci} />}
            <Field label="SLA due" value={fmtDate(c.sla_due_at)} />
            {c.mim_name && <Field label="Major-incident mgr" value={c.mim_name} />}
          </Box>
          {c.description && (<>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="caption" color="text.secondary">Description</Typography>
            <Typography variant="body2">{c.description}</Typography>
          </>)}
        </CardContent></Card>

        {/* Actions */}
        <Stack spacing={1} mb={2}>
          {!c.assignee_id && <Button fullWidth variant="contained" disabled={busy} onClick={claim}>Claim this case</Button>}
          {c.assignee_id && !mine && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 0.5 }}>
              Assigned to {c.assignee_name || 'another user'} — only they can work it.
            </Typography>
          )}
          {actions.map((a) => (
            <Button key={a} fullWidth variant={a === 'resolved' ? 'contained' : 'outlined'} color={a === 'resolved' ? 'success' : 'primary'}
              disabled={busy} onClick={() => transition(a)}>
              {a === 'in_progress' ? 'Begin work' : a === 'resolved' ? 'Resolve' : a === 'closed' ? 'Close' : a.replace('_', ' ')}
            </Button>
          ))}
          {canAssign && (
            <Button fullWidth variant="outlined" color="secondary" startIcon={<SwapHorizIcon />} disabled={busy} onClick={openReassign}>
              Reassign
            </Button>
          )}
        </Stack>

        {/* Work notes */}
        <Card><CardContent>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Work notes ({comments.length})</Typography>
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {comments.length === 0 && <Typography variant="body2" color="text.secondary">No notes yet. Add your progress below.</Typography>}
            {comments.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', gap: 1 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: m.internal ? 'warning.light' : 'primary.light' }}>
                  {(m.author_name || '?').trim()[0] || '?'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography variant="body2" fontWeight={600}>{(m.author_name || 'User').trim()}</Typography>
                    {m.internal && <Chip label="internal" size="small" color="warning" variant="outlined" sx={{ height: 16, fontSize: 10 }} />}
                    <Typography variant="caption" color="text.secondary">{fmtDate(m.created_at)}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <TextField fullWidth multiline minRows={2} size="small" placeholder="Add a progress note…"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
            <FormControlLabel control={<Switch size="small" checked={internal} onChange={(e) => setInternal(e.target.checked)} />}
              label={<Typography variant="caption">{internal ? 'Internal note' : 'Customer-visible'}</Typography>} />
            <Button variant="contained" size="small" endIcon={<SendIcon />} disabled={busy || !note.trim()} onClick={addNote}>Add note</Button>
          </Box>
        </CardContent></Card>
      </Box>

      {/* Reassign dialog */}
      <Dialog open={reOpen} onClose={() => setReOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Reassign {c.case_number}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary">Assign to a person, a team, or both.</Typography>
          <Autocomplete
            sx={{ mt: 2 }} options={users} value={pickUser} onChange={(_, v) => setPickUser(v)}
            getOptionLabel={(o: any) => `${(o.first_name || '')} ${(o.last_name || '')}`.trim() || o.username || o.email}
            isOptionEqualToValue={(o, v) => o.id === v?.id}
            renderInput={(p) => <TextField {...p} label="Assign to person" size="small"
              InputProps={{ ...p.InputProps, startAdornment: <PersonIcon fontSize="small" sx={{ mr: 0.5, color: 'text.disabled' }} /> }} />}
          />
          <TextField select fullWidth size="small" sx={{ mt: 2 }} label="Assign to team"
            value={pickTeam} onChange={(e) => setPickTeam(e.target.value)}
            InputProps={{ startAdornment: <GroupsIcon fontSize="small" sx={{ mr: 0.5, color: 'text.disabled' }} /> }}>
            <MenuItem value=""><em>— none —</em></MenuItem>
            {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={busy || (!pickUser && !pickTeam)} onClick={doReassign}>Reassign</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={2500} onClose={() => setMsg('')} message={msg} />
    </Box>
  );
}
