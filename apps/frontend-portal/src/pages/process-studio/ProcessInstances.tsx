import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Button, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel, Card, CardContent, Alert,
  Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import InboxIcon from '@mui/icons-material/Inbox';
import { processApi } from '../../api/client';
import { format } from 'date-fns';
import { PROCESS_INSTANCE_STATUS_COLORS as STATUS_COLORS } from '../../utils/statusColors';
import EmptyState from '../../components/EmptyState';
import DataTable, { DataTableColumn } from '../../components/DataTable';

// ── Main component ────────────────────────────────────────────────────────────

export default function ProcessInstances() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const qc             = useQueryClient();

  const [page, setPage]                 = useState(0);
  const [pageSize]                      = useState(20);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [defFilter,    setDefFilter]    = useState(searchParams.get('definitionId') || '');

  // Delete instance
  const [confirmDeleteInst, setConfirmDeleteInst] = useState<{ id: string; name: string } | null>(null);
  const [deleteInstError,   setDeleteInstError]   = useState('');

  const filters: any = {};
  if (statusFilter) filters.status       = statusFilter;
  if (defFilter)    filters.definitionId = defFilter;

  const { data, isLoading, refetch } = useQuery(
    ['instances', filters, page],
    () => processApi.listInstances(filters, page + 1, pageSize),
    { keepPreviousData: true },
  );

  const { data: defsData } = useQuery('process-defs-all', () => processApi.listDefs(1, 100));

  const deleteInst = useMutation(
    (id: string) => processApi.deleteInstance(id),
    {
      onSuccess: () => { qc.invalidateQueries('instances'); setConfirmDeleteInst(null); setDeleteInstError(''); },
      onError:   (e: any) => setDeleteInstError(e.response?.data?.message || e.message),
    },
  );

  const columns: DataTableColumn<any>[] = [
    { key: 'process', label: 'Process', render: inst => <Typography variant="body2" fontWeight={500}>{inst.definition_name}</Typography> },
    { key: 'ref', label: 'Reference', render: inst => (
      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
        {inst.business_key ||
          <Typography component="span" variant="caption" color="text.secondary">—</Typography>}
      </Typography>
    ) },
    { key: 'status', label: 'Status', render: inst => <Chip label={inst.status} size="small" color={STATUS_COLORS[inst.status] || 'default'} /> },
    { key: 'submitted', label: 'Submitted', render: inst => <Typography variant="body2">{format(new Date(inst.started_at), 'dd MMM HH:mm')}</Typography> },
    { key: 'completed', label: 'Completed', render: inst => inst.completed_at
      ? <Typography variant="body2">{format(new Date(inst.completed_at), 'dd MMM HH:mm')}</Typography>
      : <Typography variant="caption" color="text.secondary">—</Typography> },
    { key: 'actions', label: 'Actions', align: 'right', render: inst => (
      <>
        <Tooltip title="View Details">
          <IconButton size="small"
            onClick={(e) => { e.stopPropagation(); navigate(`/processes/instances/${inst.id}`); }}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {['terminated', 'completed'].includes(inst.status) && (
          <Tooltip title="Delete">
            <IconButton size="small" color="error"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteInstError('');
                setConfirmDeleteInst({
                  id: inst.id,
                  name: inst.business_key || inst.definition_name,
                });
              }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </>
    ) },
  ];

  return (
    <Box>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Process Monitor</Typography>
        <Box display="flex" gap={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => refetch()}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/catalog')}>
            New Request
          </Button>
        </Box>
      </Box>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
            <MenuItem value="terminated">Terminated</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Process Type</InputLabel>
          <Select label="Process Type" value={defFilter}
            onChange={e => { setDefFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            {defsData?.data?.map((d: any) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <DataTable
            columns={columns}
            rows={data?.data || []}
            rowKey={inst => inst.id}
            onRowClick={inst => navigate(`/processes/instances/${inst.id}`)}
            loading={isLoading}
            emptyState={<EmptyState icon={<InboxIcon fontSize="inherit" />} title="No requests found" description="Try a different filter, or start a new request from the Service Catalog." />}
            page={page}
            pageSize={pageSize}
            total={data?.total || 0}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <Dialog open={!!confirmDeleteInst} onClose={() => setConfirmDeleteInst(null)}
        maxWidth="xs" fullWidth>
        <DialogTitle>Delete Request?</DialogTitle>
        <DialogContent>
          {deleteInstError && <Alert severity="error" sx={{ mb: 2 }}>{deleteInstError}</Alert>}
          <Typography>
            Permanently delete <strong>{confirmDeleteInst?.name}</strong> and all its tasks?
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteInst(null)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={deleteInst.isLoading}
            onClick={() => confirmDeleteInst && deleteInst.mutate(confirmDeleteInst.id)}>
            {deleteInst.isLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
