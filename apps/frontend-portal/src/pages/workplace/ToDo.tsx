/**
 * ToDo — the Workplace "To Do" tab: everything awaiting MY action, in one place.
 *   1. Approvals awaiting my decision (inline Approve / Reject)
 *   2. Cases assigned to me (from /cases/my-work, mine=true) → /cases/:id
 * Process-backed work needs no special handling here — the case row leads to
 * CaseDetail, where the "Next Step" panel handles the workflow task.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow,
  TableCell, Chip, IconButton, Tooltip, CircularProgress, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { format } from 'date-fns';
import { caseApi, approvalApi } from '../../api/client';
import CaseWorkTable from './CaseWorkTable';

export default function ToDo() {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<{ a: any; action: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState('');

  const { data: myWork = [], isLoading: loadingWork } = useQuery('my-work', caseApi.getMyWork);
  const { data: approvals, isLoading: loadingApprovals } = useQuery('my-approvals', () => approvalApi.listPending(1, 50));

  const mineCases = (myWork as any[]).filter(c => c.mine);
  const pending: any[] = approvals?.data || [];

  const decide = useMutation(
    ({ a, action, comment }: any) =>
      action === 'approve'
        ? approvalApi.approveStep(a.id, a.step_decision_id, { comment })
        : approvalApi.rejectStep(a.id, a.step_decision_id, { comment }),
    {
      onSuccess: () => {
        qc.invalidateQueries('my-approvals'); qc.invalidateQueries('my-work');
        setDecision(null); setComment(''); setToast('Decision recorded');
      },
      onError: (e: any) => setToast(e?.response?.data?.message || 'Action failed'),
    },
  );

  if (loadingWork || loadingApprovals) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  }

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      {/* Approvals awaiting me */}
      {pending.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: 'warning.main' }}>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="h6" mb={1}>Approvals awaiting you ({pending.length})</Typography>
          </CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell><TableCell>Type</TableCell>
                <TableCell>Step</TableCell><TableCell>Requested</TableCell>
                <TableCell align="right">Decide</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((a: any) => (
                <TableRow key={a.step_decision_id || a.id} hover>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" noWrap>{a.context?.title || a.entity_id?.slice(0, 8) || '—'}</Typography>
                  </TableCell>
                  <TableCell><Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{a.entity_type}</Typography></TableCell>
                  <TableCell>{a.step_id || `Step ${(a.step_index ?? 0) + 1}`}</TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{a.created_at ? format(new Date(a.created_at), 'dd MMM HH:mm') : '—'}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Approve">
                      <IconButton size="small" onClick={() => { setComment(''); setDecision({ a, action: 'approve' }); }}>
                        <CheckCircleIcon fontSize="small" color="success" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reject">
                      <IconButton size="small" onClick={() => { setComment(''); setDecision({ a, action: 'reject' }); }}>
                        <CancelIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Cases assigned to me */}
      <Card variant="outlined">
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6" mb={1}>Assigned to me ({mineCases.length})</Typography>
        </CardContent>
        <CaseWorkTable
          cases={mineCases}
          emptyText={pending.length ? 'No cases assigned to you right now.' : "You're all caught up — nothing awaiting your action."}
        />
      </Card>

      {/* Decision dialog */}
      <Dialog open={!!decision} onClose={() => setDecision(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{decision?.action === 'approve' ? 'Approve' : 'Reject'} request</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {decision?.a?.context?.title || 'This request'}
          </Typography>
          <TextField fullWidth size="small" multiline rows={3}
            label={decision?.action === 'reject' ? 'Reason (recommended)' : 'Comment (optional)'}
            value={comment} onChange={e => setComment(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>Cancel</Button>
          <Button variant="contained" color={decision?.action === 'approve' ? 'success' : 'error'}
            disabled={decide.isLoading}
            onClick={() => decision && decide.mutate({ a: decision.a, action: decision.action, comment })}>
            {decide.isLoading ? 'Saving…' : decision?.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')}>
        <Alert severity="info" onClose={() => setToast('')}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
}
