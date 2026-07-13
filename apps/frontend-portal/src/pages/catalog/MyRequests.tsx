/**
 * My Requests — all cases raised by the current user (service-catalog requests
 * now mint a case). Ivanti-style tracker with status, search, and quick links.
 * Route: /my-requests (rendered inside Workplace → "My Requests" tab)
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Box, Typography, Card, CardContent, Button, TextField, InputAdornment,
  Chip, FormControl, InputLabel, Select, MenuItem, LinearProgress,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CancelIcon from '@mui/icons-material/Cancel';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { caseApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import DataTable, { DataTableColumn } from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';

// Case-status presentation (catalog requests are cases now).
const STATUS_META: Record<string, { label: string; color: any; Icon: React.ElementType }> = {
  new:              { label: 'New',              color: 'info',    Icon: HourglassEmptyIcon },
  open:             { label: 'Open',             color: 'primary', Icon: PlayArrowIcon },
  in_progress:      { label: 'In Progress',      color: 'primary', Icon: PlayArrowIcon },
  pending_approval: { label: 'Pending Approval', color: 'warning', Icon: HourglassEmptyIcon },
  approved:         { label: 'Approved',         color: 'info',    Icon: CheckCircleIcon },
  resolved:         { label: 'Resolved',         color: 'success', Icon: CheckCircleIcon },
  closed:           { label: 'Closed',           color: 'success', Icon: CheckCircleIcon },
  cancelled:        { label: 'Cancelled',        color: 'error',   Icon: CancelIcon },
};

const PROGRESS: Record<string, number> = {
  new: 10, open: 25, in_progress: 50, pending_approval: 60,
  approved: 75, resolved: 100, closed: 100, cancelled: 0,
};

const OPEN_STATUSES = ['new', 'open', 'in_progress', 'pending_approval', 'approved'];
const DONE_STATUSES = ['resolved', 'closed'];

export default function MyRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery(
    ['my-requests', page, statusFilter, user?.id],
    () => caseApi.list(
      {
        requesterId: user?.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      page + 1,
      20,
    ),
    { enabled: !!user, keepPreviousData: true },
  );

  const rows: any[] = (data?.data || []).filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (`${r.case_number} ${r.title || ''} ${r.catalog_item || ''}`).toLowerCase().includes(q);
  });

  const counts = {
    active:    (data?.data || []).filter((r: any) => OPEN_STATUSES.includes(r.status)).length,
    completed: (data?.data || []).filter((r: any) => DONE_STATUSES.includes(r.status)).length,
  };

  const columns: DataTableColumn<any>[] = [
    { key: 'reference', label: 'Reference', render: r => (
      <Typography variant="body2" fontWeight={600} color="primary" fontFamily="monospace">
        {r.case_number || r.id.slice(0, 8).toUpperCase()}
      </Typography>
    ) },
    { key: 'service', label: 'Service', render: r => <Typography variant="body2" fontWeight={500}>{r.catalog_item || r.title || '—'}</Typography> },
    { key: 'status', label: 'Status', render: r => {
      const meta = STATUS_META[r.status] || { label: r.status, color: 'default', Icon: HourglassEmptyIcon };
      const StatusIcon = meta.Icon;
      return (
        <Chip
          icon={<StatusIcon style={{ fontSize: 14 }} />}
          label={meta.label}
          size="small"
          color={meta.color}
          variant={OPEN_STATUSES.includes(r.status) ? 'filled' : 'outlined'}
        />
      );
    } },
    { key: 'progress', label: 'Progress', render: r => {
      const meta = STATUS_META[r.status] || { label: r.status, color: 'default', Icon: HourglassEmptyIcon };
      const progress = PROGRESS[r.status] ?? 40;
      return (
        <Box sx={{ minWidth: 140 }}>
          <LinearProgress variant="determinate" value={progress}
            color={progress === 100 ? 'success' : 'primary'}
            sx={{ height: 6, borderRadius: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {progress === 100 ? 'Complete' : meta.label}
          </Typography>
        </Box>
      );
    } },
    { key: 'submitted', label: 'Submitted', render: r => (
      <Tooltip title={format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}>
        <Typography variant="body2">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</Typography>
      </Tooltip>
    ) },
    { key: 'updated', label: 'Last Updated', render: r => (
      <Typography variant="body2" color="text.secondary">
        {r.updated_at ? format(new Date(r.updated_at), 'dd MMM HH:mm') : '—'}
      </Typography>
    ) },
    { key: 'actions', label: '', align: 'right', render: r => (
      <Button size="small" endIcon={<OpenInNewIcon />} onClick={e => { e.stopPropagation(); navigate(`/cases/${r.id}`); }}>
        View
      </Button>
    ) },
  ];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700}>My Requests</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Track the status of all your submitted service requests
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/catalog')}>
          New Request
        </Button>
      </Box>

      {/* Summary chips */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <Card variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">In Progress</Typography>
          <Typography variant="h5" fontWeight={700} color="primary.main">{counts.active}</Typography>
        </Card>
        <Card variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Completed</Typography>
          <Typography variant="h5" fontWeight={700} color="success.main">{counts.completed}</Typography>
        </Card>
        <Card variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Total</Typography>
          <Typography variant="h5" fontWeight={700}>{data?.total ?? 0}</Typography>
        </Card>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', py: '12px !important' }}>
          <TextField size="small" placeholder="Search by reference, title or service…"
            value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 260 }} />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="in_progress">In Progress</MenuItem>
              <MenuItem value="pending_approval">Pending Approval</MenuItem>
              <MenuItem value="resolved">Resolved</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={r => r.id}
          onRowClick={r => navigate(`/cases/${r.id}`)}
          loading={isLoading}
          emptyState={
            <EmptyState
              icon={<HourglassEmptyIcon fontSize="inherit" />}
              title={search || statusFilter ? 'No requests match your filters.' : "You haven't submitted any requests yet."}
              action={!search && !statusFilter && (
                <Button variant="outlined" onClick={() => navigate('/catalog')}>Browse Service Catalog</Button>
              )}
            />
          }
          page={page}
          pageSize={20}
          total={data?.total || 0}
          onPageChange={setPage}
        />
      </Card>
    </Box>
  );
}
