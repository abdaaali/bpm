import React from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Grid, Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, CircularProgress, LinearProgress, Paper,
} from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from 'recharts';
import { caseApi } from '../../api/client';
import BackButton from '../../components/BackButton';

const SLA_CARDS = [
  { key: 'on_track', label: 'On track', color: '#2e7d32' },
  { key: 'at_risk',  label: 'At risk',  color: '#ed6c02' },
  { key: 'breached', label: 'Breached', color: '#d32f2f' },
  { key: 'paused',   label: 'Paused',   color: '#0288d1' },
];
const TEAM_COLOR: Record<string, string> = { noc: '#1976d2', field_engineer: '#2e7d32', security: '#c62828', logistics: '#f9a825', manager: '#6a1b9a' };

function StatCard({ label, value, color, sub }: any) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 2 }}>
        <Typography variant="h4" fontWeight={800} sx={{ color }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function OpsDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery('ops-overview', () => caseApi.opsOverview(), { refetchInterval: 30_000 });
  if (isLoading || !data) return <Box p={4} textAlign="center"><CircularProgress /></Box>;

  const { slaHealth, byType, byTeam, vendors, spares, security, workload, capa } = data;
  const lowSpares = (spares as any[]).filter(s => s.low);
  const maxLoad = Math.max(1, ...(workload as any[]).map((w: any) => w.open));

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <InsightsIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>Telecom Operations</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Live operational health across SLA, teams, vendors, spares and security. Refreshes every 30s.
      </Typography>

      {/* SLA health */}
      <Grid container spacing={2} mb={1}>
        {SLA_CARDS.map(c => (
          <Grid item xs={6} md={3} key={c.key}>
            <StatCard label={c.label} value={(slaHealth as any)[c.key]} color={c.color}
              sub={`${slaHealth.total} open total`} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} mt={0}>
        {/* Open cases by type */}
        <Grid item xs={12} md={7}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>Open cases by type</Typography>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="open" name="Open" fill="#1976d2" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="breached" name="Breached" fill="#d32f2f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* By team */}
        <Grid item xs={12} md={5}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>Open load by team</Typography>
              {(byTeam as any[]).length === 0 ? <Typography variant="body2" color="text.secondary">No open cases.</Typography> :
                (byTeam as any[]).map((t: any) => (
                  <Box key={t.team} mb={1}>
                    <Box display="flex" justifyContent="space-between"><Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{String(t.team).replace('_', ' ')}</Typography><Typography variant="body2" fontWeight={600}>{t.open}</Typography></Box>
                    <LinearProgress variant="determinate" value={Math.min(100, t.open / maxLoad * 100)}
                      sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: TEAM_COLOR[t.team] || 'grey.500' } }} />
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Vendor escalations */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>Vendor escalations</Typography>
              {capa && (
                <Typography variant="caption" color={capa.overdue ? 'error.main' : 'text.secondary'} display="block" mb={1}>
                  CAPA: {capa.open} open{capa.overdue ? ` · ${capa.overdue} overdue` : ''}
                </Typography>
              )}
              <Box display="flex" gap={3} mb={1.5}>
                <Box><Typography variant="h4" fontWeight={800}>{vendors.open}</Typography><Typography variant="caption" color="text.secondary">open</Typography></Box>
                <Box><Typography variant="h4" fontWeight={800} color={vendors.overdue ? 'error.main' : 'text.primary'}>{vendors.overdue}</Typography><Typography variant="caption" color="text.secondary">SLA overdue</Typography></Box>
              </Box>
              {(vendors.byVendor as any[]).map((v: any) => (
                <Box key={v.vendor_name} display="flex" justifyContent="space-between" py={0.3}>
                  <Typography variant="body2" noWrap>{v.vendor_name}</Typography><Chip size="small" label={v.open} sx={{ height: 18 }} />
                </Box>
              ))}
              {!(vendors.byVendor as any[]).length && <Typography variant="body2" color="text.secondary">None open.</Typography>}
            </CardContent>
          </Card>
        </Grid>

        {/* Security ops */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>Security operations</Typography>
              {(security as any[]).length === 0 ? <Typography variant="body2" color="text.secondary">No open theft / audit cases.</Typography> :
                (security as any[]).map((s: any, i: number) => (
                  <Box key={i} display="flex" justifyContent="space-between" py={0.4}>
                    <Typography variant="body2"><Chip size="small" label={s.type === 'theft' ? 'Theft' : 'Audit'} color={s.type === 'theft' ? 'error' : 'default'} sx={{ height: 18, mr: 1 }} />{String(s.status).replace('_', ' ')}</Typography>
                    <Typography variant="body2" fontWeight={600}>{s.count}</Typography>
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Workforce load */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1}>Workforce load (open)</Typography>
              {(workload as any[]).map((w: any) => (
                <Box key={w.name} mb={0.8}>
                  <Box display="flex" justifyContent="space-between"><Typography variant="body2" noWrap>{w.name}</Typography><Typography variant="body2" fontWeight={600}>{w.open}</Typography></Box>
                  <LinearProgress variant="determinate" value={Math.min(100, w.open / maxLoad * 100)} sx={{ height: 5, borderRadius: 3 }} />
                </Box>
              ))}
              {!(workload as any[]).length && <Typography variant="body2" color="text.secondary">No assigned open cases.</Typography>}
            </CardContent>
          </Card>
        </Grid>

        {/* Spares stock */}
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>Spare parts stock</Typography>
                {lowSpares.length > 0 && <Chip size="small" color="error" label={`${lowSpares.length} below reorder`} />}
              </Box>
              <Paper variant="outlined">
                <Table size="small">
                  <TableHead><TableRow>{['Code', 'Part', 'Location', 'Quantity', 'Reorder level', 'Status'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
                  <TableBody>
                    {(spares as any[]).map((s: any) => (
                      <TableRow key={s.code} hover sx={{ bgcolor: s.low ? (t) => t.palette.mode === 'dark' ? 'rgba(198,45,63,0.12)' : '#fff5f5' : undefined }}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{s.code}</TableCell>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.location}</TableCell>
                        <TableCell>{s.quantity}</TableCell>
                        <TableCell>{s.reorder}</TableCell>
                        <TableCell>{s.low ? <Chip size="small" color="error" label="Reorder" sx={{ height: 18 }} /> : <Chip size="small" color="success" label="OK" sx={{ height: 18 }} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
