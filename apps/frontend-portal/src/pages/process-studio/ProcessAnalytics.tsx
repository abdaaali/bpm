import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Box, Typography, Grid, Card, CardContent, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell, Chip, LinearProgress,
  ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { analyticsApi } from '../../api/client';
import KPIStatCard from '../../components/KPIStatCard';

const STATUS_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f'];
const PALETTE       = ['#1976d2', '#9c27b0', '#2e7d32', '#ed6c02', '#0288d1', '#d32f2f'];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 600, color: 'text.secondary', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
      {children}
    </Typography>
  );
}

export default function ProcessAnalytics() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);

  const { data: summary, isLoading: loadingSum, error: errSum } = useQuery(
    'analytics-summary', analyticsApi.summary, { staleTime: 60000 },
  );
  const { data: byDef }       = useQuery('analytics-by-def',       analyticsApi.byDefinition,                     { staleTime: 60000 });
  const { data: overTime }    = useQuery(['analytics-over-time', days], () => analyticsApi.overTime(days),         { staleTime: 60000 });
  const { data: bottlenecks } = useQuery('analytics-bottlenecks',   analyticsApi.bottlenecks,                      { staleTime: 60000 });
  const { data: slaData }     = useQuery('analytics-sla',           analyticsApi.sla,                              { staleTime: 60000 });
  const { data: workload }    = useQuery('analytics-workload',       analyticsApi.workload,                         { staleTime: 60000 });

  if (loadingSum) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (errSum) return <Alert severity="error">Failed to load analytics</Alert>;

  const s  = summary || {};
  const si = s.instances || {};
  const st = s.tasks     || {};

  // Pie data: instance status distribution
  const pieData = [
    { name: 'Active',     value: si.active     || 0 },
    { name: 'Completed',  value: si.completed  || 0 },
    { name: 'Suspended',  value: si.suspended  || 0 },
    { name: 'Terminated', value: si.terminated || 0 },
  ].filter(d => d.value > 0);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Process Analytics</Typography>
      </Box>

      {/* ── Row 1: Summary KPIs ── */}
      <Grid container spacing={3}>
        <Grid item xs={6} sm={3}>
          <KPIStatCard label="Total Instances" value={si.total} color="#1976d2" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPIStatCard
            label="Completed (30d)"
            value={si.completedThisMonth}
            sub={`${s.completionRate ?? 0}% overall completion`}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPIStatCard
            label="Avg Cycle Time"
            value={s.avgCycleHours != null ? `${s.avgCycleHours}h` : '—'}
            sub="for completed instances"
            color="#9c27b0"
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KPIStatCard
            label="SLA Breaches"
            value={st.slaBreached}
            sub={`${st.overdue ?? 0} overdue tasks`}
            color={st.slaBreached > 0 ? '#d32f2f' : '#2e7d32'}
          />
        </Grid>
      </Grid>

      {/* ── Row 2: By Definition + Status Pie ── */}
      <SectionTitle>Instances by Process</SectionTitle>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" mb={2}>Volume &amp; Completion by Definition</Typography>
              {byDef?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byDef} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                    <RTooltip />
                    <Legend />
                    <Bar dataKey="active"    name="Active"    fill="#1976d2" stackId="a" radius={[0,0,0,0]} />
                    <Bar dataKey="completed" name="Completed" fill="#2e7d32" stackId="a" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Typography color="text.secondary" align="center" py={4}>No data yet</Typography>}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" mb={2}>Status Distribution</Typography>
              {pieData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={90}
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Typography color="text.secondary" align="center" py={4}>No instances yet</Typography>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 3: Trend over time ── */}
      <SectionTitle>Activity Over Time</SectionTitle>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle2">Instances Started vs Completed</Typography>
            <ToggleButtonGroup
              size="small" exclusive
              value={days} onChange={(_, v) => v && setDays(v)}
            >
              <ToggleButton value={7}>7d</ToggleButton>
              <ToggleButton value={30}>30d</ToggleButton>
              <ToggleButton value={90}>90d</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {overTime?.length ? (
            <ResponsiveContainer width="100%" height={260}>
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
          ) : <Typography color="text.secondary" align="center" py={4}>No data for this period</Typography>}
        </CardContent>
      </Card>

      {/* ── Row 4: Bottlenecks + Avg cycle by definition ── */}
      <SectionTitle>Bottlenecks &amp; Performance</SectionTitle>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" mb={2}>Active Task Bottlenecks</Typography>
              {bottlenecks?.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Task / Node</TableCell>
                      <TableCell>Process</TableCell>
                      <TableCell align="right">Queued</TableCell>
                      <TableCell align="right">Avg Age</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bottlenecks.map((b: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{b.taskName || b.nodeId}</Typography>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{b.nodeId}</Typography>
                        </TableCell>
                        <TableCell><Typography variant="caption">{b.processName || '—'}</Typography></TableCell>
                        <TableCell align="right">
                          <Chip label={b.count} size="small" color={b.count > 5 ? 'error' : b.count > 2 ? 'warning' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" color={b.avgAgeHours > 24 ? 'error' : 'text.secondary'}>
                            {b.avgAgeHours}h
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <Typography color="text.secondary" align="center" py={4}>No active tasks</Typography>}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" mb={2}>Avg Cycle Time by Definition (hours)</Typography>
              {byDef?.filter((d: any) => d.avgHours != null).length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byDef?.filter((d: any) => d.avgHours != null)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" unit="h" />
                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                    <RTooltip formatter={(v: any) => [`${v}h`, 'Avg Cycle']} />
                    <Bar dataKey="avgHours" name="Avg Cycle (h)" fill="#9c27b0" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Typography color="text.secondary" align="center" py={4}>Not enough data yet</Typography>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 5: SLA Compliance ── */}
      {slaData?.length > 0 && (
        <>
          <SectionTitle>SLA Compliance by Process</SectionTitle>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Process</TableCell>
                    <TableCell align="right">Tasks with SLA</TableCell>
                    <TableCell align="right">Breached</TableCell>
                    <TableCell sx={{ minWidth: 200 }}>Compliance Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {slaData.map((row: any, i: number) => (
                    <TableRow key={i} hover>
                      <TableCell><Typography variant="body2" fontWeight={500}>{row.processName}</Typography></TableCell>
                      <TableCell align="right">{row.totalTasks}</TableCell>
                      <TableCell align="right">
                        {row.breached > 0
                          ? <Chip label={row.breached} size="small" color="error" />
                          : <Typography variant="body2" color="success.main">0</Typography>}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <LinearProgress
                            variant="determinate"
                            value={row.complianceRate}
                            sx={{
                              flexGrow: 1, height: 8, borderRadius: 4,
                              bgcolor: '#fce4ec',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: row.complianceRate >= 90 ? '#2e7d32' : row.complianceRate >= 70 ? '#ed6c02' : '#d32f2f',
                              },
                            }}
                          />
                          <Typography variant="body2" sx={{ minWidth: 44 }}>{row.complianceRate}%</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Row 6: User Workload ── */}
      {workload?.length > 0 && (
        <>
          <SectionTitle>Team Workload</SectionTitle>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell align="right">Pending</TableCell>
                    <TableCell align="right">In Progress</TableCell>
                    <TableCell align="right">Overdue</TableCell>
                    <TableCell align="right">SLA Breached</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Load</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workload.map((u: any, i: number) => {
                    const maxTotal = Math.max(...workload.map((w: any) => w.total), 1);
                    return (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{u.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        </TableCell>
                        <TableCell align="right">{u.pending}</TableCell>
                        <TableCell align="right">{u.inProgress}</TableCell>
                        <TableCell align="right">
                          {u.overdue > 0 ? <Chip label={u.overdue} size="small" color="error" /> : '0'}
                        </TableCell>
                        <TableCell align="right">
                          {u.slaBreached > 0 ? <Chip label={u.slaBreached} size="small" color="warning" /> : '0'}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={`${u.total} total tasks`}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={(u.total / maxTotal) * 100}
                                sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                              />
                              <Typography variant="caption" sx={{ minWidth: 24 }}>{u.total}</Typography>
                            </Box>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
