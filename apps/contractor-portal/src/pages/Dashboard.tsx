import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Alert, CircularProgress,
  Skeleton,
} from '@mui/material';
import {
  Assignment, CheckCircle, HourglassBottom, Warning, Schedule, TrendingUp,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { dashboardApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const STATUS_CHIPS: Record<string, { label: string; color: any; icon: React.ReactNode }> = {
  pending: { label: 'Awaiting Acceptance', color: 'warning', icon: <Assignment fontSize="small" /> },
  accepted: { label: 'Accepted', color: 'info', icon: <Schedule fontSize="small" /> },
  in_progress: { label: 'In Progress', color: 'primary', icon: <HourglassBottom fontSize="small" /> },
  submitted: { label: 'Pending Review', color: 'secondary', icon: <TrendingUp fontSize="small" /> },
  rework_required: { label: 'Rework Required', color: 'error', icon: <Warning fontSize="small" /> },
  closed: { label: 'Closed', color: 'success', icon: <CheckCircle fontSize="small" /> },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#f9a825', low: '#388e3c',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi.getStats()
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const stats = data?.stats;
  const recent = data?.recent_work_orders || [];

  const statCards = [
    { label: 'Awaiting Acceptance', value: stats?.assigned || 0, color: '#e65100', icon: <Assignment />, status: 'pending' },
    { label: 'In Progress', value: stats?.in_progress || 0, color: '#1565c0', icon: <HourglassBottom />, status: 'in_progress' },
    { label: 'Pending Review', value: stats?.pending_review || 0, color: '#7b1fa2', icon: <TrendingUp />, status: 'submitted' },
    { label: 'Rework Required', value: stats?.rework_required || 0, color: '#c62828', icon: <Warning />, status: 'rework_required' },
    { label: 'Overdue', value: stats?.overdue || 0, color: '#b71c1c', icon: <Schedule />, status: 'overdue' },
  ];

  return (
    <Box>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" fontWeight="bold">Welcome, {user?.full_name?.split(' ')[0]}</Typography>
        <Typography color="text.secondary">{user?.company_name} · {format(new Date(), 'EEEE, MMMM d, yyyy')}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map(s => (
          <Grid item xs={6} sm={4} md={2.4} key={s.label}>
            <Card
              sx={{ cursor: 'pointer', borderTop: `4px solid ${s.color}`, transition: 'transform 0.1s', '&:hover': { transform: 'translateY(-2px)' } }}
              onClick={() => navigate(`/work-orders?status=${s.status}`)}
            >
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                {loading ? <Skeleton width={40} height={48} /> : (
                  <Typography variant="h3" fontWeight="bold" color={s.color}>{s.value}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Overdue alert */}
      {stats?.overdue > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={() => navigate('/work-orders?status=overdue')}>View</Button>}>
          You have <strong>{stats.overdue} overdue work order{stats.overdue > 1 ? 's' : ''}</strong> that require immediate attention.
        </Alert>
      )}

      {/* Rework alert */}
      {stats?.rework_required > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button size="small" onClick={() => navigate('/work-orders?status=rework_required')}>View</Button>}>
          <strong>{stats.rework_required} work order{stats.rework_required > 1 ? 's' : ''}</strong> returned for rework.
        </Alert>
      )}

      {/* Recent Work Orders */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Active Work Orders</Typography>
            <Button size="small" onClick={() => navigate('/work-orders')}>View All →</Button>
          </Box>
          {loading ? (
            <Box>
              {[1, 2, 3].map(i => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)}
            </Box>
          ) : recent.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={3}>No active work orders</Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell><b>Reference</b></TableCell>
                    <TableCell><b>Title</b></TableCell>
                    <TableCell><b>Priority</b></TableCell>
                    <TableCell><b>Status</b></TableCell>
                    <TableCell><b>Due</b></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recent.map((wo: any) => {
                    const chip = STATUS_CHIPS[wo.assignment_status] || { label: wo.assignment_status, color: 'default', icon: null };
                    const isOverdue = wo.due_at && new Date(wo.due_at) < new Date() && !['closed', 'rejected'].includes(wo.assignment_status);
                    return (
                      <TableRow key={wo.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/work-orders/${wo.id}`)}>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{wo.case_number}</TableCell>
                        <TableCell>{wo.title}</TableCell>
                        <TableCell>
                          <Chip label={wo.priority} size="small" sx={{ bgcolor: PRIORITY_COLORS[wo.priority] + '20', color: PRIORITY_COLORS[wo.priority], fontWeight: 600 }} />
                        </TableCell>
                        <TableCell><Chip label={chip.label} color={chip.color} size="small" /></TableCell>
                        <TableCell sx={{ color: isOverdue ? 'error.main' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                          {wo.due_at ? format(new Date(wo.due_at), 'MMM d, HH:mm') : '—'}
                          {isOverdue && ' ⚠'}
                        </TableCell>
                        <TableCell><Button size="small" onClick={e => { e.stopPropagation(); navigate(`/work-orders/${wo.id}`); }}>Open →</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
