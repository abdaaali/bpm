import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, TextField, MenuItem,
  Select, FormControl, InputLabel, CircularProgress, Alert, Pagination, Paper,
  useMediaQuery, useTheme, Grid, Divider,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { format, isAfter } from 'date-fns';
import { workOrderApi } from '../api/client';
import { statusMeta, priorityChipSx } from '../utils/statusColors';

const STATUS_OPTS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Awaiting Acceptance' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Pending Review' },
  { value: 'rework_required', label: 'Rework Required' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
];

export default function WorkOrderList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatusFilter(s);
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    workOrderApi.list({ status: statusFilter || undefined, search: debouncedSearch || undefined, page, pageSize: 20 })
      .then(r => { setWorkOrders(r.data.data || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [statusFilter, debouncedSearch, page]);

  const handleStatusChange = (v: string) => {
    setStatusFilter(v);
    setSearchParams(v ? { status: v } : {});
    setPage(1);
  };

  if (isMobile) {
    return (
      <Box>
        <Typography variant="h5" fontWeight="bold" mb={2}>Work Orders</Typography>
        <Box display="flex" gap={1} mb={2}>
          <TextField size="small" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
            sx={{ flexGrow: 1 }} />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select value={statusFilter} onChange={e => handleStatusChange(e.target.value as string)} displayEmpty>
              {STATUS_OPTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
          <Grid container spacing={2}>
            {workOrders.map(wo => {
              const isOverdue = wo.due_at && new Date(wo.due_at) < new Date() && !['closed', 'rejected'].includes(wo.assignment_status);
              return (
                <Grid item xs={12} key={wo.id}>
                  <Card sx={{
                    cursor: 'pointer', borderLeft: `4px solid ${priorityChipSx(wo.priority).color}`,
                    transition: 'box-shadow 200ms ease, transform 200ms ease',
                    '&:hover': { boxShadow: '0 8px 20px rgba(30,20,10,0.12)', transform: 'translateY(-2px)' },
                  }} onClick={() => navigate(`/work-orders/${wo.id}`)}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Typography variant="subtitle2" fontWeight="bold">{wo.case_number}</Typography>
                        <Chip label={wo.assignment_status.replace('_', ' ')} size="small" color={statusMeta(wo.assignment_status).color} />
                      </Box>
                      <Typography variant="body2">{wo.title}</Typography>
                      {wo.due_at && <Typography variant="caption" color={isOverdue ? 'error' : 'text.secondary'}>Due: {format(new Date(wo.due_at), 'MMM d, HH:mm')}{isOverdue && ' ⚠'}</Typography>}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Work Orders</Typography>
        <Typography variant="body2" color="text.secondary">{workOrders.length} items</Typography>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} mb={2} flexWrap="wrap">
        <TextField size="small" placeholder="Search by reference or title" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          InputProps={{ startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
          sx={{ minWidth: 280 }} />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => handleStatusChange(e.target.value as string)}>
            {STATUS_OPTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><b>Reference</b></TableCell>
              <TableCell><b>Title / Site</b></TableCell>
              <TableCell><b>Priority</b></TableCell>
              <TableCell><b>Status</b></TableCell>
              <TableCell><b>Assigned</b></TableCell>
              <TableCell><b>Due Date</b></TableCell>
              <TableCell><b>Assigned To</b></TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : workOrders.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No work orders found</TableCell></TableRow>
            ) : workOrders.map(wo => {
              const isOverdue = wo.due_at && new Date(wo.due_at) < new Date() && !['closed', 'rejected'].includes(wo.assignment_status);
              return (
                <TableRow key={wo.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/work-orders/${wo.id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{wo.case_number}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">{wo.title}</Typography>
                    {wo.site_name && <Typography variant="caption" color="text.secondary">{wo.site_name}</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip label={wo.priority} size="small" sx={priorityChipSx(wo.priority)} />
                  </TableCell>
                  <TableCell>
                    <Chip label={wo.assignment_status?.replace(/_/g, ' ')} size="small" color={statusMeta(wo.assignment_status).color} sx={{ textTransform: 'capitalize' }} />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{wo.assigned_at ? format(new Date(wo.assigned_at), 'MMM d') : '—'}</TableCell>
                  <TableCell sx={{ color: isOverdue ? 'error.main' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                    {wo.due_at ? format(new Date(wo.due_at), 'MMM d, HH:mm') : '—'}
                    {isOverdue && ' ⚠'}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{wo.assigned_user_name || 'Company'}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); navigate(`/work-orders/${wo.id}`); }}>Open</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
