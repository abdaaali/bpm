import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Chip, Button,
  Table, TableHead, TableBody, TableRow, TableCell, ToggleButtonGroup,
  ToggleButton, Alert, LinearProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RepeatIcon from '@mui/icons-material/Repeat';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BugReportIcon from '@mui/icons-material/BugReport';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ReferenceLine, ResponsiveContainer,
  AreaChart, Area, BarChart,
} from 'recharts';
import { rcaApi } from '../../api/client';
import BackButton from '../../components/BackButton';

// ── Color helpers ──────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Hardware:      '#ef5350',
  Software:      '#42a5f5',
  Network:       '#66bb6a',
  Security:      '#ab47bc',
  Process:       '#ffa726',
  Capacity:      '#26c6da',
  'Third Party': '#8d6e63',
  Change:        '#78909c',
  Unknown:       '#bdbdbd',
  Unclassified:  '#e0e0e0',
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#0288d1', low: '#388e3c',
};
const TYPE_COLOR: Record<string, string> = {
  incident: '#ef5350', problem: '#ab47bc', change: '#42a5f5',
  request: '#66bb6a', alarm: '#ffa726',
};

function categoryColor(label: string) { return CATEGORY_COLORS[label] || '#9e9e9e'; }

function PctChip({ val }: { val: number }) {
  const color = val >= 50 ? '#d32f2f' : val >= 20 ? '#f57c00' : '#388e3c';
  return <Chip label={`${val}%`} size="small" sx={{ bgcolor: color, color: '#fff', fontWeight: 600, fontSize: 11 }} />;
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: color || 'text.secondary' }}>
          {icon}
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
        <Typography variant="h4" fontWeight={700}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

const PARETO_DIMS = [
  { key: 'root_cause_category',    label: 'Root Cause' },
  { key: 'root_cause_subcategory', label: 'Sub-Cause' },
  { key: 'type',                   label: 'Type' },
  { key: 'priority',               label: 'Priority' },
];

export default function RcaPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [paretoDim, setParetoDim] = useState('root_cause_category');

  const { data: summary, isLoading: sumLoading } = useQuery(['rca-summary', days], () => rcaApi.summary(days));
  const { data: pareto = [], isLoading: paretoLoading } = useQuery(['rca-pareto', paretoDim, days], () => rcaApi.pareto(paretoDim, days));
  const { data: trends = [], isLoading: trendsLoading } = useQuery(['rca-trends', days], () => rcaApi.trends(days));
  const { data: repeats = [], isLoading: repeatsLoading } = useQuery(['rca-repeats', days], () => rcaApi.repeatOffenders(days));
  const { data: emerging } = useQuery('rca-emerging', () => rcaApi.emergingProblems(), { refetchInterval: 60_000 });
  const { data: procAnalysis = [], isLoading: procLoading } = useQuery(['rca-proc', days], () => rcaApi.processAnalysis(days));
  const { data: resTime = [], isLoading: resLoading } = useQuery(['rca-res', days], () => rcaApi.resolutionTime(days));

  // Build stacked area data from trends
  const trendCategories = Array.from(new Set((trends as any[]).map((r: any) => r.category)));
  const trendByDay: Record<string, any> = {};
  (trends as any[]).forEach((r: any) => {
    if (!trendByDay[r.day]) trendByDay[r.day] = { day: r.day };
    trendByDay[r.day][r.category] = r.cnt;
  });
  const trendData = Object.values(trendByDay).sort((a: any, b: any) => a.day.localeCompare(b.day));

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Root Cause Analysis</Typography>
        <ToggleButtonGroup value={days} exclusive onChange={(_, v) => v && setDays(v)} size="small">
          <ToggleButton value={7}>7d</ToggleButton>
          <ToggleButton value={30}>30d</ToggleButton>
          <ToggleButton value={90}>90d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* KPI Cards */}
      {sumLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>
      ) : summary ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <KpiCard icon={<CheckCircleIcon />} label="Total Cases" value={summary.total} color="#1565c0" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <KpiCard icon={<CheckCircleIcon />} label="Resolved" value={summary.totalResolved} sub={summary.total > 0 ? `${Math.round(100*summary.totalResolved/summary.total)}% of total` : ''} color="#388e3c" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <KpiCard icon={<BugReportIcon />} label="Root Cause Identified" value={summary.withRootCause} sub={summary.totalResolved > 0 ? `${Math.round(100*summary.withRootCause/summary.totalResolved)}% of resolved` : ''} color="#0288d1" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <KpiCard icon={<RepeatIcon />} label="Recurring" value={summary.recurring} color="#ab47bc" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <KpiCard icon={<AccessTimeIcon />} label="Avg Resolution" value={summary.avgResolutionHours ? `${summary.avgResolutionHours}h` : '—'} sub={summary.topRootCause ? `Top: ${summary.topRootCause}` : undefined} color="#f57c00" />
          </Grid>
        </Grid>
      ) : null}

      {/* Row 1: Pareto + Resolution Time */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Pareto Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600}>Pareto Analysis</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {PARETO_DIMS.map(d => (
                    <Chip
                      key={d.key}
                      label={d.label}
                      size="small"
                      clickable
                      onClick={() => setParetoDim(d.key)}
                      color={paretoDim === d.key ? 'primary' : 'default'}
                      variant={paretoDim === d.key ? 'filled' : 'outlined'}
                    />
                  ))}
                </Box>
              </Box>
              {paretoLoading ? <CircularProgress size={24} /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={pareto as any[]} margin={{ top: 5, right: 30, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <RTooltip formatter={(v: any, name: string) => name === 'Cumulative %' ? `${v}%` : v} />
                    <Legend />
                    <ReferenceLine yAxisId="right" y={80} stroke="#f57c00" strokeDasharray="4 4" label={{ value: '80%', position: 'right', fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="cnt" name="Cases" fill="#42a5f5" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#f57c00" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Resolution Time */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Avg Resolution Time (hours)</Typography>
              {resLoading ? <CircularProgress size={24} /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={resTime as any[]} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: any) => [`${v}h`, 'Avg Hours']} />
                    <Bar dataKey="avgHours" name="Avg Hours" fill="#42a5f5" radius={[0, 3, 3, 0]}
                      label={{ position: 'right', fontSize: 10, formatter: (v: any) => `${v}h` }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Row 2: Trends */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Case Trends by Root Cause Category</Typography>
          {trendsLoading ? <CircularProgress size={24} /> : trendData.length === 0 ? (
            <Alert severity="info">No case data for the selected period. Create and resolve cases with root cause categories to populate this chart.</Alert>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Legend />
                {trendCategories.map(cat => (
                  <Area key={cat} type="monotone" dataKey={cat} stackId="1"
                    stroke={categoryColor(cat)} fill={categoryColor(cat)} fillOpacity={0.7} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Emerging problems — anomaly detection (offline, modified z-score) */}
      <Card sx={{ mb: 2, borderLeft: '4px solid #ef6c00' }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
            ⚠ Emerging Problems <Typography component="span" variant="caption" color="text.secondary">— anomalous incident volume per CI (modified z-score, no model training)</Typography>
          </Typography>
          {!emerging?.anomalies?.length ? (
            <Typography variant="body2" color="text.secondary">
              No anomalies. {emerging ? `Baseline: median ${emerging.median}/CI over ${emerging.ciCount} CIs (30d).` : ''}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow>{['Configuration item', 'Incidents (30d)', 'Recent (7d)', 'Anomaly score', ''].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {emerging.anomalies.map((a: any) => (
                  <TableRow key={a.ci} hover sx={{ bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(181,118,15,0.13)' : '#fff8e1' }}>
                    <TableCell sx={{ fontWeight: 600 }}>{a.ci}</TableCell>
                    <TableCell>{a.total}</TableCell>
                    <TableCell>{a.recent}{a.recent >= a.total / 2 ? ' ↑' : ''}</TableCell>
                    <TableCell><Chip size="small" color="warning" label={`z ${a.modifiedZ}`} /></TableCell>
                    <TableCell><Button size="small" onClick={() => navigate(`/cases?type=incident&search=${encodeURIComponent(a.ci)}`)}>View incidents</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Repeat Offenders + Process Analysis */}
      <Grid container spacing={2}>
        {/* Repeat Offenders */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                <RepeatIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle', color: '#ab47bc' }} />
                Repeat Offenders
              </Typography>
              {repeatsLoading ? <CircularProgress size={24} /> : (repeats as any[]).length === 0 ? (
                <Alert severity="info">No categorized cases yet.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Subcategory</TableCell>
                      <TableCell align="right">Hits</TableCell>
                      <TableCell align="right">Recurring</TableCell>
                      <TableCell align="right">Breach%</TableCell>
                      <TableCell align="right">Avg Hrs</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(repeats as any[]).map((row: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip label={row.category} size="small"
                            sx={{ bgcolor: categoryColor(row.category), color: '#fff', fontSize: 10, fontWeight: 600 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.subcategory || '—'}</TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700}>{row.occurrences}</Typography></TableCell>
                        <TableCell align="right">{row.recurringCount > 0 ? <Chip label={row.recurringCount} size="small" color="warning" /> : '—'}</TableCell>
                        <TableCell align="right">{row.breachRate > 0 ? <PctChip val={row.breachRate} /> : '—'}</TableCell>
                        <TableCell align="right">{row.avgResolutionHours ? `${row.avgResolutionHours}h` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Process Analysis */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                <WarningAmberIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle', color: '#f57c00' }} />
                Process & Case Type Analysis
              </Typography>
              {procLoading ? <CircularProgress size={24} /> : (procAnalysis as any[]).length === 0 ? (
                <Alert severity="info">No process request data yet.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Root Cause</TableCell>
                      <TableCell>Process</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Avg Hrs</TableCell>
                      <TableCell align="right">Breach%</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(procAnalysis as any[]).slice(0, 10).map((row: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell>
                          <Chip label={row.type} size="small"
                            sx={{ bgcolor: TYPE_COLOR[row.type] || '#9e9e9e', color: '#fff', fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }}>
                          {row.rootCauseCategory ? (
                            <Box>
                              <Chip label={row.rootCauseCategory} size="small"
                                sx={{ bgcolor: categoryColor(row.rootCauseCategory), color: '#fff', fontSize: 10, mb: 0.3 }} />
                              {row.rootCauseSubcategory && (
                                <Typography variant="caption" display="block" color="text.secondary">{row.rootCauseSubcategory}</Typography>
                              )}
                            </Box>
                          ) : <Typography variant="caption" color="text.disabled">Unclassified</Typography>}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }}>{row.processName || '—'}</TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700}>{row.count}</Typography></TableCell>
                        <TableCell align="right">{row.avgResolutionHours ? `${row.avgResolutionHours}h` : '—'}</TableCell>
                        <TableCell align="right">{row.breachRate > 0 ? <PctChip val={row.breachRate} /> : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Footer note */}
      <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
        Analysis based on cases with root cause classification. Set root cause when resolving cases to improve data quality.
      </Typography>
    </Box>
  );
}
