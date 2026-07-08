import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, BottomNavigation, BottomNavigationAction, Paper,
  List, ListItemButton, ListItemText, ListSubheader, Chip, CircularProgress, Avatar, Button, Divider, Badge,
  Card, CardContent, LinearProgress, Grid,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import InsightsIcon from '@mui/icons-material/Insights';
import RefreshIcon from '@mui/icons-material/Refresh';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { api } from '../api';
import { useAuth } from '../auth';
import { getConn, clearConn, MODES } from '../connection';

const PRIO: Record<string, any> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };

function useList(path: string, enabled = true) {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.get(path).then((r) => setData(Array.isArray(r.data) ? r.data : r.data.data || [])).catch(() => setData([])).finally(() => setLoading(false)); };
  useEffect(() => { if (enabled) load(); }, [path, enabled]);
  return { data, loading, reload: load };
}

function Loading() { return <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress /></Box>; }

function dueText(c: any): { text: string; color: any } | null {
  if (c.breached) return { text: 'overdue', color: 'error' };
  if (c.sla_at_risk) return { text: 'at risk', color: 'warning' };
  if (!c.sla_due_at) return null;
  const h = Math.round((new Date(c.sla_due_at).getTime() - Date.now()) / 3.6e6);
  if (h <= 0) return { text: 'overdue', color: 'error' };
  return { text: h < 24 ? `due ${h}h` : `due ${Math.round(h / 24)}d`, color: 'default' };
}

function CasesTab() {
  const nav = useNavigate();
  const { data, loading, reload } = useList('/cases/my-work');
  const claim = (id: string) => api.post(`/cases/${id}/claim`).then(reload).catch(() => {});
  if (loading) return <Loading />;
  const mine = data.filter((c: any) => c.mine);
  const team = data.filter((c: any) => !c.mine);

  const Row = (c: any, claimable: boolean) => {
    const due = dueText(c);
    return (
      <ListItemButton key={c.id} divider onClick={() => nav(`/case/${c.id}`)} sx={{ alignItems: 'flex-start' }}>
        <ListItemText
          primary={
            <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
              <b>{c.case_number}</b>
              <Chip size="small" label={c.priority} color={PRIO[c.priority]} sx={{ height: 18 }} />
              {due && <Chip size="small" label={due.text} color={due.color} variant="outlined" sx={{ height: 18 }} />}
            </Box>}
          secondary={<>{c.title}<br /><small>{String(c.status).replace(/_/g, ' ')}{c.team_name ? ` · ${c.team_name}` : ''}</small></>} />
        {claimable && (
          <Button size="small" variant="outlined" sx={{ mt: 0.5 }}
            onClick={(e) => { e.stopPropagation(); claim(c.id); }}>Claim</Button>
        )}
      </ListItemButton>
    );
  };

  return (
    <List subheader={<li />}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}><Button size="small" startIcon={<RefreshIcon />} onClick={reload}>Refresh</Button></Box>
      <ListSubheader>My cases ({mine.length})</ListSubheader>
      {mine.map((c: any) => Row(c, false))}
      {mine.length === 0 && <Typography sx={{ px: 2, py: 1 }} variant="body2" color="text.secondary">None assigned to you.</Typography>}
      {team.length > 0 && <>
        <ListSubheader>Team queue — unclaimed ({team.length})</ListSubheader>
        {team.map((c: any) => Row(c, true))}
      </>}
      {!data.length && <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">Nothing assigned to you or your team.</Typography>}
    </List>
  );
}

function AlertsTab() {
  const { data, loading, reload } = useList('/notifications?unread=false&page=1');
  const markRead = (id: string) => api.patch('/notifications/read', { ids: [id] }).then(reload).catch(() => {});
  if (loading) return <Loading />;
  return (
    <List>
      {data.map((n) => (
        <ListItemButton key={n.id} divider onClick={() => markRead(n.id)} sx={{ bgcolor: n.read_at ? undefined : '#e3f2fd' }}>
          <ListItemText primary={<b>{n.subject}</b>} secondary={<span dangerouslySetInnerHTML={{ __html: (n.body || '').replace(/<[^>]+>/g, ' ').slice(0, 120) }} />} />
        </ListItemButton>
      ))}
      {!data.length && <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No alerts.</Typography>}
    </List>
  );
}

function WorkOrdersTab() {
  const nav = useNavigate();
  const { data, loading, reload } = useList('/work-orders');
  if (loading) return <Loading />;
  return (
    <List>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}><Button size="small" startIcon={<RefreshIcon />} onClick={reload}>Refresh</Button></Box>
      {data.map((w) => (
        <ListItemButton key={w.id} divider onClick={() => nav(`/wo/${w.id}`)}>
          <ListItemText primary={<b>{w.work_order_ref || w.title || w.id}</b>}
            secondary={<>{w.title || w.description}<br /><small>{String(w.assignment_status || '').replace(/_/g, ' ')}</small></>} />
        </ListItemButton>
      ))}
      {!data.length && <Typography sx={{ p: 3, textAlign: 'center' }} color="text.secondary">No work orders.</Typography>}
    </List>
  );
}

const APPROVER_ROLES = ['admin', 'manager', 'approver', 'cab_member', 'finance_controller'];

function ApprovalsTab() {
  const [data, setData] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.get('/approval/instances/pending?pageSize=50')
    .then((r) => setData(r.data?.data || [])).catch(() => setData([]));
  useEffect(() => { load(); }, []);

  const decide = (a: any, action: 'approve' | 'reject') => {
    let comment: string | undefined;
    if (action === 'reject') {
      comment = window.prompt('Reason for rejection (required):') || '';
      if (!comment.trim()) return; // reject requires a reason
    }
    setBusy(a.step_decision_id);
    api.post(`/approval/instances/${a.id}/steps/${a.step_decision_id}/${action}`, { comment })
      .then(load).catch((e) => window.alert(e.response?.data?.message || 'Action failed'))
      .finally(() => setBusy(null));
  };

  if (data === null) return <Loading />;
  return (
    <List>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, pt: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>Awaiting my decision ({data.length})</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Box>
      {data.map((a) => {
        const due = a.due_at ? Math.round((new Date(a.due_at).getTime() - Date.now()) / 3.6e6) : null;
        const ref = a.case_number || `${a.entity_type || 'item'} ${String(a.entity_id || '').slice(0, 8)}`;
        const working = busy === a.step_decision_id;
        return (
          <Card key={a.step_decision_id} variant="outlined" sx={{ mx: 1.5, my: 1 }}>
            <CardContent sx={{ pb: 1.5 }}>
              <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap" mb={0.5}>
                <b>{ref}</b>
                {a.case_priority && <Chip size="small" label={a.case_priority} color={PRIO[a.case_priority]} sx={{ height: 18 }} />}
                {due !== null && <Chip size="small" variant="outlined" color={due <= 0 ? 'error' : due < 24 ? 'warning' : 'default'}
                  label={due <= 0 ? 'overdue' : due < 24 ? `due ${due}h` : `due ${Math.round(due / 24)}d`} sx={{ height: 18 }} />}
              </Box>
              <Typography variant="body2" fontWeight={600}>{a.case_title || a.policy_name || 'Approval request'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {a.step_label}{a.policy_name ? ` · ${a.policy_name}` : ''}{a.requester_name ? ` · by ${a.requester_name}` : ''}
              </Typography>
              <Box display="flex" gap={1} mt={1.5}>
                <Button size="small" variant="contained" color="success" disabled={working} onClick={() => decide(a, 'approve')}>Approve</Button>
                <Button size="small" variant="outlined" color="error" disabled={working} onClick={() => decide(a, 'reject')}>Reject</Button>
              </Box>
            </CardContent>
          </Card>
        );
      })}
      {!data.length && <Typography sx={{ p: 4, textAlign: 'center' }} color="text.secondary">No approvals waiting on you. 👍</Typography>}
    </List>
  );
}

function AccountTab() {
  const nav = useNavigate(); const { user, logout } = useAuth(); const conn = getConn()!;
  const meta = MODES.find((m) => m.mode === conn.mode);
  return (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Avatar sx={{ width: 64, height: 64, mx: 'auto', mb: 1, bgcolor: meta?.color }}>{(user?.name || '?')[0]}</Avatar>
      <Typography variant="h6">{user?.name || user?.email || user?.username}</Typography>
      <Chip label={meta?.title} size="small" sx={{ mt: 1 }} />
      <Divider sx={{ my: 3 }} />
      <Button fullWidth variant="outlined" sx={{ mb: 1 }} onClick={() => { logout(); clearConn(); nav('/connect'); }}>Switch connection</Button>
      <Button fullWidth color="error" onClick={() => { logout(); nav('/login'); }}>Sign out</Button>
    </Box>
  );
}

const SLA = [
  { key: 'on_track', label: 'On track', color: '#2e7d32' },
  { key: 'at_risk', label: 'At risk', color: '#ed6c02' },
  { key: 'breached', label: 'Breached', color: '#d32f2f' },
  { key: 'paused', label: 'Paused', color: '#0288d1' },
];

const PRIO_COLOR: Record<string, string> = { critical: '#d32f2f', high: '#ed6c02', medium: '#0288d1', low: '#757575' };

function InsightsTab() {
  const navigate = useNavigate();
  const [d, setD] = useState<any>(null);
  const load = () => api.get('/cases/my-queue/stats').then((r) => setD(r.data)).catch(() => setD(null));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!d) return <Loading />;
  const STATS = [
    { label: 'Open', value: d.open, color: '#1565c0' },
    { label: 'Breached', value: d.breached, color: '#d32f2f' },
    { label: 'At risk', value: d.atRisk, color: '#ed6c02' },
    { label: 'Due ≤24h', value: d.dueSoon, color: '#6a1b9a' },
  ];
  const maxP = Math.max(1, ...(d.byPriority || []).map((p: any) => p.count));
  const dueLabel = (s: any) => {
    if (s.breached) return 'overdue';
    if (!s.sla_due_at) return '';
    const hrs = Math.round((new Date(s.sla_due_at).getTime() - Date.now()) / 3.6e6);
    return hrs <= 0 ? 'overdue' : hrs < 24 ? `due ${hrs}h` : `due ${Math.round(hrs / 24)}d`;
  };
  return (
    <Box sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle1" fontWeight={700}>My Queue</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Box>
      <Grid container spacing={1.5} mb={2}>
        {STATS.map((s) => (
          <Grid item xs={3} key={s.label}>
            <Card variant="outlined"><CardContent sx={{ py: 1.25, px: 1, textAlign: 'center', '&:last-child': { pb: 1.25 } }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: s.value ? s.color : 'text.disabled' }}>{s.value}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{s.label}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      {(d.byPriority || []).length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Open by priority</Typography>
          {['critical', 'high', 'medium', 'low'].map((p) => {
            const row = (d.byPriority || []).find((x: any) => x.priority === p); if (!row) return null;
            return (
              <Box key={p} mb={0.75}>
                <Box display="flex" justifyContent="space-between"><Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{p}</Typography><Typography variant="body2" fontWeight={600}>{row.count}</Typography></Box>
                <LinearProgress variant="determinate" value={Math.min(100, (row.count / maxP) * 100)}
                  sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: PRIO_COLOR[p] } }} />
              </Box>
            );
          })}
        </CardContent></Card>
      )}

      <Card variant="outlined" sx={{ mb: 2 }}><CardContent sx={{ '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Needs attention first</Typography>
        {(d.attention || []).length === 0 ? <Typography variant="body2" color="text.secondary">Nothing urgent — you're on top of it. 👍</Typography>
          : (d.attention || []).map((s: any) => (
            <Box key={s.id} display="flex" alignItems="center" gap={1} py={0.6} sx={{ cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }} onClick={() => navigate(`/case/${s.id}`)}>
              <Box sx={{ width: 6, height: 32, borderRadius: 3, bgcolor: PRIO_COLOR[s.priority] || '#999' }} />
              <Box flex={1} minWidth={0}>
                <Typography variant="body2" fontWeight={600} noWrap>{s.case_number} · {s.title}</Typography>
                <Typography variant="caption" color="text.secondary">{String(s.status).replace(/_/g, ' ')}</Typography>
              </Box>
              {(s.breached || s.sla_at_risk || dueLabel(s) === 'overdue') &&
                <Chip size="small" color={s.breached ? 'error' : 'warning'} label={dueLabel(s)} sx={{ height: 20 }} />}
              {!s.breached && !s.sla_at_risk && dueLabel(s) && dueLabel(s) !== 'overdue' &&
                <Typography variant="caption" color="text.secondary">{dueLabel(s)}</Typography>}
            </Box>
          ))}
      </CardContent></Card>

      <Box display="flex" justifyContent="space-between" px={0.5}>
        <Typography variant="caption" color="text.secondary">Resolved today: <b>{d.resolvedToday}</b> · 7d: <b>{d.resolved7d}</b></Typography>
        {d.oldestOpenDays > 0 && <Typography variant="caption" color="text.secondary">Oldest open: <b>{d.oldestOpenDays}d</b></Typography>}
      </Box>
    </Box>
  );
}

export default function Home() {
  const conn = getConn()!;
  const meta = MODES.find((m) => m.mode === conn.mode);
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const bpm = conn.mode === 'bpm';
  const isApprover = (user?.roles || []).some((r: string) => APPROVER_ROLES.includes(r));
  const tabs = bpm
    ? [
        { icon: <FolderIcon />, label: 'Cases', el: <CasesTab /> },
        { icon: <NotificationsIcon />, label: 'Alerts', el: <AlertsTab /> },
        ...(isApprover ? [{ icon: <FactCheckIcon />, label: 'Approvals', el: <ApprovalsTab /> }] : []),
        { icon: <InsightsIcon />, label: 'Insights', el: <InsightsTab /> },
        { icon: <PersonIcon />, label: 'Account', el: <AccountTab /> },
      ]
    : [{ icon: <AssignmentIcon />, label: 'Work Orders', el: <WorkOrdersTab /> }, { icon: <PersonIcon />, label: 'Account', el: <AccountTab /> }];
  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="sticky" sx={{ bgcolor: meta?.color }}>
        <Toolbar variant="dense"><Typography variant="h6" fontWeight={700}>BPM Field</Typography><Box flex={1} />
          <Typography variant="caption">{meta?.title}</Typography></Toolbar>
      </AppBar>
      <Box>{tabs[tab].el}</Box>
      <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={8}>
        <BottomNavigation showLabels value={tab} onChange={(_, v) => setTab(v)}>
          {tabs.map((t, i) => <BottomNavigationAction key={i} label={t.label} icon={t.icon} />)}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
