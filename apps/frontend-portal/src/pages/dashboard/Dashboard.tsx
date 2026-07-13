import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Grid, Card, CardContent, Typography, Box, Chip, CircularProgress, Button, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, Avatar, List, ListItem,
  ListItemAvatar, ListItemText, Select, MenuItem, FormControl, InputLabel, LinearProgress,
} from '@mui/material';
import { dashboardApi, caseApi, analyticsApi, auditApi, processApi, mdmApi } from '../../api/client';
import { useAccess } from '../../auth/useAccess';
import BackButton from '../../components/BackButton';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FolderIcon from '@mui/icons-material/Folder';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DnsIcon from '@mui/icons-material/Dns';
import HistoryIcon from '@mui/icons-material/History';
import TimelapseIcon from '@mui/icons-material/Timelapse';

import { format, formatDistanceToNow } from 'date-fns';

const PIE_COLORS = ['#1976d2', '#9c27b0', '#2e7d32', '#ed6c02', '#d32f2f', '#0288d1', '#795548'];
const PRIORITY_COLORS: Record<string, any> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };
const STATUS_COLORS: Record<string, any> = { new: 'info', open: 'primary', in_progress: 'warning', resolved: 'success', closed: 'default', cancelled: 'default', pending: 'secondary' };
const TYPE_COLORS: Record<string, any> = { incident: 'error', problem: 'warning', change: 'info', request: 'success', alarm: 'secondary' };

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color = '#1976d2', sub, onClick }: {
  label: string; value: any; icon: React.ReactNode; color?: string;
  sub?: string; onClick?: () => void;
}) {
  return (
    <Card
      sx={{ height: '100%', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s', '&:hover': onClick ? { boxShadow: 6 } : {} }}
      onClick={onClick}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h3" sx={{ color, fontWeight: 700, lineHeight: 1.1 }}>{value ?? '—'}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>{label}</Typography>
            {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
          </Box>
          <Box sx={{ color, opacity: 0.7, mt: 0.5 }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
      <Typography variant="h6">{children}</Typography>
      {action}
    </Box>
  );
}

// ── Entity type icon colours for audit feed ───────────────────────────────────
const ENTITY_COLORS: Record<string, string> = {
  case: '#9c27b0', task: '#1976d2', process_instance: '#2e7d32',
  approval_instance: '#ed6c02', user: '#0288d1', connector: '#795548',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { can } = useAccess();
  const isDesigner = can('processes:read'); // process monitoring is designer-only
  const [selectedDiv, setSelectedDiv] = useState('');

  // ── Operational data queries (no personal "my work" — that lives in Workplace) ──
  const { data: stats, isLoading } = useQuery('dashboard', dashboardApi.stats, { refetchInterval: 60_000 });
  const { data: caseStats }        = useQuery('caseStats', caseApi.stats, { staleTime: 60_000 });
  // Process analytics is a designer-only surface AND requires analytics:read at
  // the gateway — only fire these when the user is a designer (who always holds
  // analytics:read), else non-designers reaching /dashboard get 403s.
  const { data: procSummary }      = useQuery('analytics-summary', analyticsApi.summary, { staleTime: 120_000, enabled: isDesigner });
  const { data: overTime }         = useQuery(['analytics-over-time', 14], () => analyticsApi.overTime(14), { staleTime: 120_000, enabled: isDesigner });
  const { data: critCases }        = useQuery(['crit-cases'], () => caseApi.list({ priority: 'critical' }, 1, 6), { staleTime: 60_000 });
  const { data: highCases }        = useQuery(['high-cases'], () => caseApi.list({ priority: 'high' }, 1, 4), { staleTime: 60_000 });
  const { data: poolTasks }        = useQuery(['pool-tasks-dash'], () => processApi.listTasks({ status: 'pending' }, 1, 5), { staleTime: 30_000 });
  const { data: recentAudit }      = useQuery(['recent-audit'], () => auditApi.list({}, 1, 10), { staleTime: 30_000 });
  const { data: mdmStats }         = useQuery(['mdm-stats'], mdmApi.stats, { staleTime: 120_000 });
  const { data: caseByDivision }   = useQuery(['cases-by-division'], caseApi.byDivision, { staleTime: 120_000 });
  const { data: caseByDept }       = useQuery(['cases-by-dept', selectedDiv], () => caseApi.byDepartment(selectedDiv), { enabled: !!selectedDiv, staleTime: 120_000 });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;

  const s   = stats    || {};
  const ps  = procSummary?.instances || {};
  const pt  = procSummary?.tasks     || {};
  const rawCs = caseStats || {};
  // DB COUNT() returns strings — parse to int so recharts renders correctly
  const cs = {
    ...rawCs,
    byStatus:      (rawCs.byStatus  || []).map((r: any) => ({ ...r, count: parseInt(r.count) })),
    byType:        (rawCs.byType    || []).map((r: any) => ({ ...r, count: parseInt(r.count) })),
    breachedCount: rawCs.breachedCount  != null ? parseInt(rawCs.breachedCount)  : undefined,
    resolvedToday: rawCs.resolvedToday  != null ? parseInt(rawCs.resolvedToday)  : undefined,
    openCount:     rawCs.openCount      != null ? parseInt(rawCs.openCount)      : undefined,
  };

  const topPriorityCases = [
    ...(critCases?.data || []),
    ...(highCases?.data || []),
  ].filter((c: any) => !['resolved', 'closed', 'cancelled'].includes(c.status)).slice(0, 8);

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      {/* ── Title ── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4">Operational Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Platform-wide operational health. Your personal queue lives in My Workplace.
          </Typography>
        </Box>
      </Box>

      {/* ── KPI Row 1 ── */}
      <Grid container spacing={2} mb={2}>
        {isDesigner && (
          <Grid item xs={6} sm={3}>
            <KpiCard label="Active Processes" value={ps.active ?? s.tasks?.inProgress}
              icon={<AccountTreeIcon />} color="#1976d2"
              sub={ps.total ? `${ps.total} total` : undefined}
              onClick={() => navigate('/processes/instances?status=active')} />
          </Grid>
        )}
        <Grid item xs={6} sm={3}>
          <KpiCard label="Open Cases" value={s.cases?.openCount ?? cs.openCount}
            icon={<FolderIcon />} color="#9c27b0"
            onClick={() => navigate('/cases')} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Pending Approvals" value={s.approvals?.pending}
            icon={<CheckCircleIcon />} color="#ed6c02"
            onClick={() => navigate('/approvals/instances')} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Overdue Tasks" value={pt.overdue ?? s.tasks?.overdue}
            icon={<SpeedIcon />} color="#d32f2f"
            sub={pt.slaBreached ? `${pt.slaBreached} SLA breaches` : undefined}
            onClick={() => navigate('/workplace?tab=tasks')} />
        </Grid>
      </Grid>

      {/* ── KPI Row 2 ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={3}>
          <KpiCard label="SLA Breached Cases" value={s.cases?.breachedCount ?? cs.breachedCount}
            icon={<WarningAmberIcon />} color="#d32f2f"
            sub="active breaches"
            onClick={() => navigate('/cases')} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard label="Resolved Today" value={s.cases?.resolvedToday ?? cs.resolvedToday}
            icon={<CheckCircleIcon />} color="#2e7d32" />
        </Grid>
        {isDesigner && (
          <Grid item xs={6} sm={3}>
            <KpiCard label="Avg Cycle Time"
              value={procSummary?.avgCycleHours != null ? `${procSummary.avgCycleHours}h` : '—'}
              icon={<TimelapseIcon />} color="#00897b"
              sub="process completion" />
          </Grid>
        )}
        <Grid item xs={6} sm={3}>
          <KpiCard label="MDM Hosts" value={s.mdm?.total ?? mdmStats?.total}
            icon={<DnsIcon />} color="#795548"
            sub={s.mdm?.active != null ? `${s.mdm.active} active` : undefined}
            onClick={() => navigate('/mdm')} />
        </Grid>
      </Grid>

      {/* ── SLA Alert Banner ── */}
      {((s.tasks?.slaBreached > 0) || (s.cases?.breachedCount > 0) || (cs.breachedCount > 0)) && (
        <Card sx={{ border: '1px solid #d32f2f', mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <WarningAmberIcon color="error" />
                <Typography variant="h6" color="error">SLA Alerts</Typography>
                {s.tasks?.slaBreached > 0 && <Chip label={`${s.tasks.slaBreached} task SLA breaches`} color="error" size="small" />}
                {(s.cases?.breachedCount || cs.breachedCount) > 0 && (
                  <Chip label={`${s.cases?.breachedCount ?? cs.breachedCount} case SLA breaches`} color="error" size="small" />
                )}
              </Box>
              {isDesigner
                ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/processes/analytics')}>View Analytics</Button>
                : <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/cases?breached=true')}>View Cases</Button>}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── Process Activity + Process Snapshot (designer-only) ── */}
      {isDesigner && (
      <Grid container spacing={3} mb={3}>
        {overTime?.length > 0 && (
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <SectionTitle action={
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/processes/analytics')}>Full Analytics</Button>
                }>Process Activity (14 days)</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={overTime}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} />
                    <RTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="started"   name="Started"   stroke="#1976d2" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#2e7d32" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} md={overTime?.length > 0 ? 4 : 12}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/processes/analytics')}>Full Analytics</Button>
              }>Process Snapshot</SectionTitle>
              <Box display="flex" flexDirection="column" gap={2}>
                {[
                  { label: 'Active instances',      value: ps.active,     color: '#1976d2' },
                  { label: 'Completed (all time)',   value: ps.completed,  color: '#2e7d32' },
                  { label: 'Suspended',              value: ps.suspended,  color: '#ed6c02' },
                  { label: 'Terminated',             value: ps.terminated, color: '#9e9e9e' },
                ].map(item => (
                  <Box key={item.label} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                    <Typography variant="h6" sx={{ color: item.color, fontWeight: 700 }}>{item.value ?? 0}</Typography>
                  </Box>
                ))}
                <Divider />
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Avg cycle time</Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {procSummary?.avgCycleHours != null ? `${procSummary.avgCycleHours}h` : '—'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}

      {/* ── Cases by Status + Cases by Type + MDM Hosts ── */}
      <Grid container spacing={3} mb={3}>
        {cs.byStatus?.length > 0 && (
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <SectionTitle action={
                  <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/cases')}>View</Button>
                }>Cases by Status</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={cs.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={75}
                      label={({ status, count }) => `${status}: ${count}`} labelLine={false}>
                      {(cs.byStatus || []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {cs.byType?.length > 0 && (
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <SectionTitle>Cases by Type</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={cs.byType} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Bar dataKey="count" fill="#9c27b0" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/mdm')}>Manage</Button>
              }>MDM Hosts</SectionTitle>
              <Grid container spacing={1} mb={2}>
                {[
                  { label: 'Total',    value: s.mdm?.total    ?? mdmStats?.total,    color: '#1976d2' },
                  { label: 'Active',   value: s.mdm?.active   ?? mdmStats?.active,   color: '#2e7d32' },
                  { label: 'Inactive', value: s.mdm?.inactive ?? mdmStats?.inactive, color: '#9e9e9e' },
                ].map(item => (
                  <Grid item xs={4} key={item.label}>
                    <Box textAlign="center" p={1} sx={{ bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="h5" sx={{ color: item.color, fontWeight: 700 }}>{item.value ?? 0}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              {(s.mdm?.total ?? mdmStats?.total) > 0 && (
                <Box mb={2}>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">Active ratio</Typography>
                    <Typography variant="caption" fontWeight={600}>
                      {Math.round(((s.mdm?.active ?? mdmStats?.active ?? 0) / (s.mdm?.total ?? mdmStats?.total ?? 1)) * 100)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round(((s.mdm?.active ?? mdmStats?.active ?? 0) / (s.mdm?.total ?? mdmStats?.total ?? 1)) * 100)}
                    color="success" sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              )}
              {(s.mdm?.byRegion ?? mdmStats?.byRegion)?.slice(0, 4).map((r: any) => (
                <Box key={r.region} display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 140 }}>{r.region}</Typography>
                  <Chip label={r.count} size="small" />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Top Priority Cases ── */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box px={2} pt={2} pb={1} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">Top Priority Cases</Typography>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/cases')}>All Cases</Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Number</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Assignee</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {topPriorityCases.map((c: any) => (
                    <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${c.id}`)}>
                      <TableCell><Typography variant="body2" fontWeight={600} color="primary">{c.case_number}</Typography></TableCell>
                      <TableCell sx={{ maxWidth: 200 }}><Typography variant="body2" noWrap>{c.title}</Typography></TableCell>
                      <TableCell><Chip label={c.type} size="small" color={TYPE_COLORS[c.type] || 'default'} /></TableCell>
                      <TableCell><Chip label={c.priority} size="small" color={PRIORITY_COLORS[c.priority] || 'default'} /></TableCell>
                      <TableCell><Chip label={c.status} size="small" color={STATUS_COLORS[c.status] || 'default'} /></TableCell>
                      <TableCell>{c.assignee_name || <Typography variant="caption" color="text.secondary">Unassigned</Typography>}</TableCell>
                    </TableRow>
                  ))}
                  {!topPriorityCases.length && (
                    <TableRow><TableCell colSpan={6} align="center">No critical or high priority open cases</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Case Distribution by Division + by Department ── */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <SectionTitle action={
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/cases')}>All Cases</Button>
              }>Cases by Division</SectionTitle>
              {(!caseByDivision || caseByDivision.length === 0) ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                  No cases assigned to divisions yet
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={caseByDivision} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="division" tick={{ fontSize: 11 }} width={130} />
                    <RTooltip formatter={(v: any) => [v, 'Cases']} />
                    <Bar dataKey="count" name="Cases" radius={[0, 3, 3, 0]}>
                      {(caseByDivision || []).map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Cases by Department</Typography>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Division</InputLabel>
                  <Select label="Division" value={selectedDiv}
                    onChange={e => setSelectedDiv(e.target.value)}>
                    <MenuItem value=""><em>Select a division…</em></MenuItem>
                    {(caseByDivision || []).map((d: any) => (
                      <MenuItem key={d.division_id} value={d.division_id}>{d.division}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              {!selectedDiv ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                  Select a division to see department breakdown
                </Typography>
              ) : (!caseByDept || caseByDept.length === 0) ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                  No cases found for departments in this division
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={caseByDept} margin={{ top: 0, right: 10, bottom: 30, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="department" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: any) => [v, 'Cases']} />
                    <Bar dataKey="count" name="Cases" radius={[3, 3, 0, 0]}>
                      {(caseByDept || []).map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Recent Activity + Pending Pool Tasks ── */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <SectionTitle action={
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/audit')}>Full Log</Button>
              }>
                <Box display="flex" alignItems="center" gap={1}><HistoryIcon fontSize="small" />Recent Activity</Box>
              </SectionTitle>
              <List dense disablePadding>
                {recentAudit?.data?.map((entry: any) => (
                  <ListItem key={entry.id} disableGutters divider sx={{ py: 0.75 }}>
                    <ListItemAvatar sx={{ minWidth: 36 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: ENTITY_COLORS[entry.entity_type] || '#bdbdbd' }}>
                        {(entry.entity_type || '?')[0].toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          <strong>{entry.action}</strong>{' '}
                          <span style={{ color: '#666' }}>{entry.entity_type?.replace(/_/g, ' ')}</span>
                          {entry.entity_id && (
                            <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                              #{entry.entity_id.slice(0, 6)}
                            </Typography>
                          )}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {entry.actor_name || entry.actor_email || (entry.actor_id ? entry.actor_id.slice(0, 8) + '…' : 'System')}
                          {' · '}{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
                {!recentAudit?.data?.length && (
                  <Typography variant="body2" color="text.secondary" py={2} textAlign="center">No recent activity</Typography>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box px={2} pt={2} pb={1} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">
                  <Box component="span" display="flex" alignItems="center" gap={1}>
                    <AssignmentIcon fontSize="small" />Pending Pool Tasks
                  </Box>
                </Typography>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/workplace?tab=tasks')}>Workplace</Button>
              </Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    <TableCell>Process</TableCell>
                    <TableCell>Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(poolTasks?.data || s.pendingTasks || []).filter((t: any) => !t.assignee_id).slice(0, 5).map((t: any) => (
                    <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate('/workplace?tab=tasks')}>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{t.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{t.process_name || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        {t.due_at
                          ? <Chip label={format(new Date(t.due_at), 'dd MMM')} size="small"
                              color={new Date(t.due_at) < new Date() ? 'error' : 'default'} />
                          : <Typography variant="caption" color="text.secondary">—</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(poolTasks?.data?.filter((t: any) => !t.assignee_id).length) && !(s.pendingTasks?.length) && (
                    <TableRow><TableCell colSpan={3} align="center">No pending tasks in the pool</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
