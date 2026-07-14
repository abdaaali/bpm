import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, AppBar, Toolbar, Typography, BottomNavigation, BottomNavigationAction, Paper,
  List, ListItemButton, ListItemText, Chip, Avatar, Button, Divider, Card, CardContent, LinearProgress, Grid,
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
import { PriorityChip, StatusChip, dueChipProps, EmptyState, LoadingState, clickableCardSx } from '../components/ui';

function useList(path: string, enabled = true) {
  const [data, setData] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.get(path).then((r) => setData(Array.isArray(r.data) ? r.data : r.data.data || [])).catch(() => setData([])).finally(() => setLoading(false)); };
  useEffect(() => { if (enabled) load(); }, [path, enabled]);
  return { data, loading, reload: load };
}

/** Small header row used at the top of every tab: title/count + a refresh action. */
function TabHeader({ title, onRefresh }: { title: string; onRefresh: () => void }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, pt: 2.5, pb: 1 }}>
      <Typography variant="h6" fontWeight={800} fontSize="1.15rem">{title}</Typography>
      <Button size="small" startIcon={<RefreshIcon fontSize="small" />} onClick={onRefresh}>Refresh</Button>
    </Box>
  );
}

function CasesTab() {
  const nav = useNavigate();
  const { data, loading, reload } = useList('/cases/my-work');
  const claim = (id: string) => api.post(`/cases/${id}/claim`).then(reload).catch(() => {});
  if (loading) return <LoadingState label="Loading your cases…" />;
  const mine = data.filter((c: any) => c.mine);
  const team = data.filter((c: any) => !c.mine);

  const Row = (c: any, claimable: boolean) => {
    const due = dueChipProps(c);
    return (
      <Card key={c.id} sx={{ ...clickableCardSx, mx: 2, mb: 1.75 }}>
        <ListItemButton onClick={() => nav(`/case/${c.id}`)} sx={{ alignItems: 'flex-start', py: 1.75, px: 2 }}>
          <ListItemText
            primary={
              <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
                <Typography component="span" fontWeight={800} variant="body1">{c.case_number}</Typography>
                <PriorityChip value={c.priority} />
                {due && <Chip size="small" label={due.text} color={due.color} variant="outlined" sx={{ height: 20 }} />}
              </Box>}
            secondary={
              <>
                <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block', mt: 0.5 }}>{c.title}</Typography>
                <Box display="flex" alignItems="center" gap={0.75} mt={1}>
                  <StatusChip value={c.status} />
                  {c.team_name && <Typography variant="caption" color="text.secondary">{c.team_name}</Typography>}
                </Box>
              </>
            } />
          {claimable && (
            <Button size="small" variant="outlined" sx={{ mt: 0.5, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); claim(c.id); }}>Claim</Button>
          )}
        </ListItemButton>
      </Card>
    );
  };

  return (
    <Box sx={{ pb: 1 }}>
      <TabHeader title={`My cases (${mine.length})`} onRefresh={reload} />
      <List sx={{ py: 0.5 }}>
        {mine.map((c: any) => Row(c, false))}
      </List>
      {mine.length === 0 && <Typography sx={{ px: 3.5, py: 1 }} variant="body2" color="text.secondary">None assigned to you.</Typography>}
      {team.length > 0 && <>
        <TabHeader title={`Team queue · unclaimed (${team.length})`} onRefresh={reload} />
        <List sx={{ py: 0.5 }}>
          {team.map((c: any) => Row(c, true))}
        </List>
      </>}
      {!data.length && <EmptyState icon={<FolderIcon fontSize="inherit" />} title="Nothing here" description="No cases assigned to you or your team." />}
    </Box>
  );
}

function AlertsTab() {
  const { data, loading, reload } = useList('/notifications?unread=false&page=1');
  const markRead = (id: string) => api.patch('/notifications/read', { ids: [id] }).then(reload).catch(() => {});
  if (loading) return <LoadingState label="Loading alerts…" />;
  return (
    <Box sx={{ pb: 1 }}>
      <TabHeader title={`Alerts (${data.length})`} onRefresh={reload} />
      <List sx={{ px: 1.5 }}>
        {data.map((n) => (
          <ListItemButton key={n.id} onClick={() => markRead(n.id)} sx={{
            mb: 0.75, py: 1.25,
            bgcolor: n.read_at ? 'transparent' : 'primary.50',
            '&:hover': { bgcolor: n.read_at ? 'rgba(0,0,0,0.03)' : 'primary.100' },
          }}>
            <NotificationsIcon fontSize="small" sx={{ mr: 1.5, color: n.read_at ? 'text.disabled' : 'primary.main', mt: 0.25 }} />
            <ListItemText
              primary={<Typography variant="body2" fontWeight={n.read_at ? 500 : 700}>{n.subject}</Typography>}
              secondary={<span dangerouslySetInnerHTML={{ __html: (n.body || '').replace(/<[^>]+>/g, ' ').slice(0, 120) }} />} />
          </ListItemButton>
        ))}
      </List>
      {!data.length && <EmptyState icon={<NotificationsIcon fontSize="inherit" />} title="You're all caught up" description="No alerts right now." />}
    </Box>
  );
}

function WorkOrdersTab() {
  const nav = useNavigate();
  const { data, loading, reload } = useList('/work-orders');
  if (loading) return <LoadingState label="Loading work orders…" />;
  return (
    <Box sx={{ pb: 1 }}>
      <TabHeader title={`Work orders (${data.length})`} onRefresh={reload} />
      <List sx={{ py: 0.5 }}>
        {data.map((w) => (
          <Card key={w.id} sx={{ ...clickableCardSx, mx: 2, mb: 1.75 }}>
            <ListItemButton onClick={() => nav(`/wo/${w.id}`)} sx={{ py: 1.75, px: 2 }}>
              <ListItemText
                primary={<Typography fontWeight={800} variant="body1">{w.work_order_ref || w.title || w.id}</Typography>}
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block', mt: 0.5 }}>{w.title || w.description}</Typography>
                    <Box mt={1}><StatusChip value={w.assignment_status} /></Box>
                  </>
                } />
            </ListItemButton>
          </Card>
        ))}
      </List>
      {!data.length && <EmptyState icon={<AssignmentIcon fontSize="inherit" />} title="No work orders" description="Nothing assigned to you yet." />}
    </Box>
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

  if (data === null) return <LoadingState label="Loading approvals…" />;
  return (
    <Box sx={{ pb: 1 }}>
      <TabHeader title={`Awaiting my decision (${data.length})`} onRefresh={load} />
      {data.map((a) => {
        const due = a.due_at ? Math.round((new Date(a.due_at).getTime() - Date.now()) / 3.6e6) : null;
        const ref = a.case_number || `${a.entity_type || 'item'} ${String(a.entity_id || '').slice(0, 8)}`;
        const working = busy === a.step_decision_id;
        return (
          <Card key={a.step_decision_id} sx={{ mx: 2, my: 1.25 }}>
            <CardContent sx={{ pb: 1.5 }}>
              <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap" mb={0.5}>
                <Typography component="span" fontWeight={700} variant="body2">{ref}</Typography>
                {a.case_priority && <PriorityChip value={a.case_priority} />}
                {due !== null && <Chip size="small" variant="outlined" color={due <= 0 ? 'error' : due < 24 ? 'warning' : 'default'}
                  label={due <= 0 ? 'overdue' : due < 24 ? `due ${due}h` : `due ${Math.round(due / 24)}d`} sx={{ height: 20 }} />}
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
      {!data.length && <EmptyState icon={<FactCheckIcon fontSize="inherit" />} title="Nothing waiting on you" description="You're fully caught up on approvals." />}
    </Box>
  );
}

function AccountTab() {
  const nav = useNavigate(); const { user, logout } = useAuth(); const conn = getConn()!;
  const meta = MODES.find((m) => m.mode === conn.mode);
  return (
    <Box sx={{ p: 3 }}>
      <Card sx={{ textAlign: 'center', p: 4, mb: 3.5, background: `linear-gradient(180deg, ${meta?.color}10 0%, #ffffff 45%)` }}>
        <Avatar sx={{ width: 84, height: 84, mx: 'auto', mb: 2, background: meta?.gradient, fontSize: 32, boxShadow: `0 8px 20px ${meta?.color}55` }}>
          {(user?.name || user?.email || '?')[0]?.toUpperCase()}
        </Avatar>
        <Typography variant="h6" fontWeight={800} fontSize="1.2rem">{user?.name || user?.email || user?.username}</Typography>
        {user?.email && user?.name && <Typography variant="body2" color="text.secondary">{user.email}</Typography>}
        <Chip label={meta?.title} size="small" sx={{ mt: 2, bgcolor: meta?.color, color: '#fff', fontWeight: 700 }} />
      </Card>
      <Button fullWidth variant="outlined" size="large" sx={{ mb: 1.5 }} onClick={() => { logout(); clearConn(); nav('/connect'); }}>Switch connection</Button>
      <Button fullWidth color="error" size="large" onClick={() => { logout(); nav('/login'); }}>Sign out</Button>
      <Divider sx={{ my: 3 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Box component="img" src="/bpm-logo-official.png" alt="BPM Portal"
          sx={{ width: 28, height: 28, objectFit: 'contain' }} />
        <Typography variant="caption" color="text.secondary">BPM Portal · Mobile</Typography>
      </Box>
    </Box>
  );
}

const SLA_STAT_COLOR: Record<string, string> = { Open: '#1976d2', Breached: '#d32f2f', 'At risk': '#ed6c02', 'Due ≤24h': '#6a1b9a' };
const PRIO_COLOR: Record<string, string> = { critical: '#d32f2f', high: '#ed6c02', medium: '#1976d2', low: '#757575' };

function InsightsTab() {
  const navigate = useNavigate();
  const [d, setD] = useState<any>(null);
  const load = () => api.get('/cases/my-queue/stats').then((r) => setD(r.data)).catch(() => setD(null));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!d) return <LoadingState label="Loading insights…" />;
  const STATS = [
    { label: 'Open', value: d.open },
    { label: 'Breached', value: d.breached },
    { label: 'At risk', value: d.atRisk },
    { label: 'Due ≤24h', value: d.dueSoon },
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
      <TabHeader title="My Queue" onRefresh={load} />
      <Grid container spacing={1.5} mb={2.5} mt={0.25}>
        {STATS.map((s) => (
          <Grid item xs={3} key={s.label}>
            <Card><CardContent sx={{ py: 1.75, px: 1, textAlign: 'center', '&:last-child': { pb: 1.75 } }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: s.value ? SLA_STAT_COLOR[s.label] : 'text.disabled' }}>{s.value}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{s.label}</Typography>
            </CardContent></Card>
          </Grid>
        ))}
      </Grid>

      {(d.byPriority || []).length > 0 && (
        <Card sx={{ mb: 2.5 }}><CardContent>
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

      <Card sx={{ mb: 2.5 }}><CardContent sx={{ '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Needs attention first</Typography>
        {(d.attention || []).length === 0 ? <Typography variant="body2" color="text.secondary">Nothing urgent — you're on top of it. 👍</Typography>
          : (d.attention || []).map((s: any) => (
            <Box key={s.id} display="flex" alignItems="center" gap={1} py={0.6} sx={{ cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider' }} onClick={() => navigate(`/case/${s.id}`)}>
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
    <Box sx={{ pb: 10, minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} sx={{ background: meta?.gradient }}>
        <Toolbar sx={{ gap: 1.25, minHeight: 64, py: 1 }}>
          <Box component="img" src="/bpm-logo-official.png" alt="BPM Portal"
            sx={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
          <Typography variant="h6" fontWeight={800} sx={{ fontSize: 19 }}>BPM Field</Typography>
          <Box flex={1} />
          {/* Translucent (not meta.color) so it stays visible against a same-hue AppBar. */}
          <Chip label={meta?.title} size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, height: 26, px: 0.5, border: '1px solid rgba(255,255,255,0.32)' }} />
        </Toolbar>
      </AppBar>
      <Box>{tabs[tab].el}</Box>
      <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' }} elevation={12}>
        <BottomNavigation showLabels value={tab} onChange={(_, v) => setTab(v)} sx={{ height: 72 }}>
          {tabs.map((t, i) => <BottomNavigationAction key={i} label={t.label} icon={t.icon} sx={{ pt: 1.25 }} />)}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
