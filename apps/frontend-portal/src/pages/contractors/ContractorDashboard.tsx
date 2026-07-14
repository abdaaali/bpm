import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, CircularProgress,
  ToggleButton, ToggleButtonGroup, LinearProgress, Alert,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VerifiedIcon from '@mui/icons-material/Verified';
import TimerIcon from '@mui/icons-material/Timer';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Sector,
} from 'recharts';
import { useQuery } from 'react-query';
import { contractorApi } from '../../api/client';
import BackButton from '../../components/BackButton';

interface DashboardData {
  kpis: {
    active_work_orders: number;
    avg_acceptance_rate: number;
    first_time_right_rate: number;
    avg_completion_hours: number;
  };
  top_contractors: {
    company_id: string;
    company_name: string;
    active_count: number;
    overdue_count: number;
    completion_rate: number;
    avg_completion_hours: number;
  }[];
  assignments_by_company: { company_name: string; count: number }[];
  completion_trend: { week: string; completed: number; dispatched: number }[];
  status_breakdown: { status: string; count: number }[];
}

const PIE_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2', '#0097a7'];

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  rework_required: 'Rework',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export default function ContractorDashboard() {
  const [range, setRange] = useState<string>('30d');

  const { data, isLoading, isError } = useQuery<DashboardData>(
    ['contractor-dashboard', range],
    () => contractorApi.getDashboard().then(r => r.data),
    { refetchInterval: 60_000 },
  );

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  if (isError || !data) {
    return (
      <Box>
        <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Contractor Performance Dashboard</Typography>
        <Alert severity="warning">
          Dashboard data unavailable. The contractor service may not yet be configured.
        </Alert>
      </Box>
    );
  }

  const { kpis, top_contractors = [], assignments_by_company = [], completion_trend = [], status_breakdown = [] } = data;

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Contractor Performance Dashboard</Typography>
        <ToggleButtonGroup
          value={range}
          exclusive
          onChange={(_, v) => v && setRange(v)}
          size="small"
        >
          <ToggleButton value="7d">7 days</ToggleButton>
          <ToggleButton value="30d">30 days</ToggleButton>
          <ToggleButton value="90d">90 days</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Active Work Orders',
            value: kpis?.active_work_orders ?? 0,
            icon: <AssignmentIcon />,
            color: '#1976d2',
            suffix: '',
          },
          {
            label: 'Avg Acceptance Rate',
            value: kpis?.avg_acceptance_rate ?? 0,
            icon: <TrendingUpIcon />,
            color: '#388e3c',
            suffix: '%',
          },
          {
            label: 'First-Time-Right Rate',
            value: kpis?.first_time_right_rate ?? 0,
            icon: <VerifiedIcon />,
            color: '#7b1fa2',
            suffix: '%',
          },
          {
            label: 'Avg Completion Time',
            value: kpis?.avg_completion_hours ?? 0,
            icon: <TimerIcon />,
            color: '#f57c00',
            suffix: 'h',
          },
        ].map(kpi => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{
                    bgcolor: kpi.color + '18',
                    borderRadius: 2,
                    p: 1,
                    color: kpi.color,
                    display: 'flex',
                  }}>
                    {kpi.icon}
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700} sx={{ color: kpi.color }}>
                      {typeof kpi.value === 'number' && !Number.isInteger(kpi.value)
                        ? kpi.value.toFixed(1)
                        : kpi.value}{kpi.suffix}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{kpi.label}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Bar chart: assignments per company */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Assignments per Company
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={assignments_by_company}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="company_name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <RechartTooltip />
                  <Bar dataKey="count" fill="#1976d2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Status Pie */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Status Breakdown
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={status_breakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ status, percent }) =>
                      `${STATUS_LABEL_MAP[status] || status} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {status_breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartTooltip
                    formatter={(val, name) => [val, STATUS_LABEL_MAP[name as string] || name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Line chart: completion trend */}
        <Grid item xs={12} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Completion Trend (by week)
              </Typography>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={completion_trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <RechartTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dispatched" stroke="#1976d2" name="Dispatched" dot={false} />
                  <Line type="monotone" dataKey="completed" stroke="#388e3c" name="Completed" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top Contractors Table */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Contractor Performance — Top Companies
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell><b>Company</b></TableCell>
                  <TableCell align="right"><b>Active</b></TableCell>
                  <TableCell align="right"><b>Overdue</b></TableCell>
                  <TableCell align="center"><b>Completion Rate</b></TableCell>
                  <TableCell align="right"><b>Avg Hours</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {top_contractors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No contractor data available yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  top_contractors.map(c => (
                    <TableRow key={c.company_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{c.company_name}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={c.active_count} size="small" color="primary" />
                      </TableCell>
                      <TableCell align="right">
                        {c.overdue_count > 0 ? (
                          <Chip label={c.overdue_count} size="small" color="error" />
                        ) : (
                          <Typography variant="body2" color="success.main">0</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={c.completion_rate}
                            sx={{ flex: 1, height: 8, borderRadius: 4 }}
                            color={c.completion_rate >= 90 ? 'success' : c.completion_rate >= 70 ? 'warning' : 'error'}
                          />
                          <Typography variant="caption">{c.completion_rate.toFixed(0)}%</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{c.avg_completion_hours.toFixed(1)}h</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
