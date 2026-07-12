import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Button, Chip, Table, TableHead, TableBody, TableRow, TableCell,
  TablePagination, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel, Card, CardContent, Alert,
  Tooltip, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import { processApi } from '../../api/client';
import { format } from 'date-fns';
import { PROCESS_INSTANCE_STATUS_COLORS as STATUS_COLORS } from '../../utils/statusColors';

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
          {isLoading ? (
            <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Process</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.data?.map((inst: any) => (
                  <TableRow key={inst.id} hover sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/processes/instances/${inst.id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{inst.definition_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {inst.business_key ||
                          <Typography component="span" variant="caption" color="text.secondary">—</Typography>}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={inst.status} size="small" color={STATUS_COLORS[inst.status] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{format(new Date(inst.started_at), 'dd MMM HH:mm')}</Typography>
                    </TableCell>
                    <TableCell>
                      {inst.completed_at
                        ? <Typography variant="body2">{format(new Date(inst.completed_at), 'dd MMM HH:mm')}</Typography>
                        : <Typography variant="caption" color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell align="right" onClick={e => e.stopPropagation()}>
                      <Tooltip title="View Details">
                        <IconButton size="small"
                          onClick={() => navigate(`/processes/instances/${inst.id}`)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {['terminated', 'completed'].includes(inst.status) && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error"
                            onClick={() => {
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
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.data?.length && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No requests found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <TablePagination
            component="div"
            count={data?.total || 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[20]}
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
