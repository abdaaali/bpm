import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  TablePagination, CircularProgress, Divider, Alert, Select, MenuItem,
  FormControl, InputLabel,
} from '@mui/material';
import { approvalApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { format } from 'date-fns';
import BackButton from '../../components/BackButton';

const STATUS_COLOR: Record<string, any> = {
  pending: 'warning', approved: 'success', rejected: 'error',
};

export default function ApprovalInstances() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  // Arriving from the Home "Management" cards: scope=organization narrows to
  // approvals requested by people in the leader's org tree (same scoping as
  // the leadership-summary counters), and attention=urgent further narrows to
  // escalated/overdue — see instance.service.ts's findOrganizationScoped.
  // Without this, every card landed on the exact same unfiltered list.
  const scope = params.get('scope');
  const attention = params.get('attention') || undefined;
  const isOrgScoped = scope === 'organization';
  // "Awaiting My Approval" — reuses the same listPending endpoint ToDo's
  // approvals section already shows, so this view and that count always agree.
  const isMineScoped = scope === 'mine';

  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState(params.get('status') || '');
  const [viewing, setViewing] = useState<any>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const [decideError, setDecideError] = useState('');

  const { data, isLoading } = useQuery(
    ['approval-instances', page, filterStatus, isOrgScoped, isMineScoped, attention],
    () => isOrgScoped ? approvalApi.listOrganizationScoped({ attention }, page + 1, 20)
      : isMineScoped ? approvalApi.listPending(page + 1, 20)
      : approvalApi.listInstances(filterStatus ? { status: filterStatus } : {}, page + 1, 20),
  );

  const openView = async (inst: any) => {
    setLoadingView(true);
    setDecideError('');
    setComment('');
    setAction('approve');
    try {
      const full = await approvalApi.getInstance(inst.id);
      setViewing(full);
    } finally {
      setLoadingView(false);
    }
  };

  // The current user's pending decision record in the viewed instance.
  // user.id is the Keycloak sub; decisions carry both the internal approver_id
  // and approver_keycloak_id, so match on either.
  const myDecision = viewing?.decisions?.find(
    (d: any) => (d.approver_keycloak_id === user?.id || d.approver_id === user?.id) && !d.decision,
  );

  const decide = useMutation(
    async () => {
      if (!myDecision) throw new Error('No pending decision assigned to you on this instance');
      if (action === 'reject') {
        return approvalApi.rejectStep(viewing.id, myDecision.id, { comment });
      }
      return approvalApi.approveStep(viewing.id, myDecision.id, { comment });
    },
    {
      onSuccess: (updated: any) => {
        qc.invalidateQueries('approval-instances');
        qc.invalidateQueries('my-approvals');
        setViewing(updated);
        setComment('');
        setDecideError('');
      },
      onError: (e: any) => setDecideError(e.response?.data?.message || e.message || 'Decision failed'),
    },
  );

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4">
            {attention === 'urgent' ? 'Overdue & Escalated Approvals'
              : isOrgScoped ? 'My Organization Approvals'
              : isMineScoped ? 'Awaiting My Approval'
              : 'Approval Instances'}
          </Typography>
          {isOrgScoped && (
            <Typography variant="body2" color="text.secondary">
              {attention === 'urgent'
                ? 'Escalated, or pending past their due date — requested by your organization and its teams.'
                : 'Pending or escalated — requested by your organization and its teams.'}
            </Typography>
          )}
          {isMineScoped && (
            <Typography variant="body2" color="text.secondary">Decisions personally assigned to you that are still pending.</Typography>
          )}
        </Box>
        {!isOrgScoped && !isMineScoped && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Filter by status</InputLabel>
            <Select label="Filter by status" value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>

      <Card>
        {isLoading ? (
          <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Current Step</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.data?.map((inst: any) => {
                  const currentStep = inst.resolved_steps?.[inst.current_step_index];
                  return (
                    <TableRow key={inst.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {inst.id.slice(0, 8)}…
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{inst.entity_type || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {inst.entity_id?.slice(0, 8)}…
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography variant="body2" noWrap>
                          {inst.context?.title || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={inst.status} size="small"
                          color={STATUS_COLOR[inst.status] || 'default'} />
                      </TableCell>
                      <TableCell>
                        {currentStep
                          ? <Typography variant="body2">
                              {currentStep.label || `Step ${inst.current_step_index + 1}`}
                            </Typography>
                          : '—'}
                      </TableCell>
                      <TableCell>{format(new Date(inst.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" disabled={loadingView}
                          onClick={() => openView(inst)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!data?.data?.length && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No approval instances found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div" count={data?.total || 0} page={page} rowsPerPage={20}
              onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[20]} />
          </>
        )}
      </Card>

      {/* ── View / Decide Dialog ── */}
      <Dialog
        open={!!viewing}
        onClose={() => { setViewing(null); setComment(''); setDecideError(''); }}
        maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Approval Instance
          {viewing && (
            <Chip label={viewing.status} size="small"
              color={STATUS_COLOR[viewing.status] || 'default'} />
          )}
        </DialogTitle>
        <DialogContent>
          {viewing && (
            <Box display="flex" flexDirection="column" gap={1.5} mt={1}>
              {/* Instance meta */}
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Entity Type</Typography>
                  <Typography variant="body2">{viewing.entity_type || '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Entity ID</Typography>
                  <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                    {viewing.entity_id?.slice(0, 16)}…
                  </Typography>
                </Box>
                {viewing.context?.title && (
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <Typography variant="caption" color="text.secondary">Subject</Typography>
                    <Typography variant="body2">{viewing.context.title}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">Step</Typography>
                  <Typography variant="body2">
                    {viewing.current_step_index + 1} of {viewing.resolved_steps?.length || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2">
                    {format(new Date(viewing.created_at), 'dd MMM yyyy HH:mm')}
                  </Typography>
                </Box>
              </Box>

              {/* Step decisions table */}
              {viewing.decisions?.length > 0 && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="subtitle2">Step Decisions</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Approver</TableCell>
                        <TableCell>Step</TableCell>
                        <TableCell>Decision</TableCell>
                        <TableCell>Due</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {viewing.decisions.map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            {(d.first_name || d.last_name)
                              ? `${d.first_name || ''} ${d.last_name || ''}`.trim()
                              : `${d.approver_id?.slice(0, 8)}…`}
                          </TableCell>
                          <TableCell>{d.step_id || `Step ${(d.step_index ?? 0) + 1}`}</TableCell>
                          <TableCell>
                            {d.decision
                              ? <Chip label={d.decision} size="small"
                                  color={d.decision === 'approved' ? 'success' : 'error'} />
                              : <Chip label="pending" size="small" color="warning" />}
                          </TableCell>
                          <TableCell>
                            {d.due_at ? format(new Date(d.due_at), 'dd MMM HH:mm') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              {/* Decide section — only if current user has a pending decision */}
              {myDecision && viewing.status === 'pending' && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="subtitle2">Your Decision</Typography>
                  {decideError && <Alert severity="error">{decideError}</Alert>}
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      variant={action === 'approve' ? 'contained' : 'outlined'}
                      color="success"
                      onClick={() => setAction('approve')}>
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant={action === 'reject' ? 'contained' : 'outlined'}
                      color="error"
                      onClick={() => setAction('reject')}>
                      Reject
                    </Button>
                  </Box>
                  <TextField fullWidth multiline rows={2} size="small"
                    label={action === 'reject' ? 'Rejection reason (required)' : 'Comment (optional)'}
                    value={comment} onChange={e => setComment(e.target.value)} />
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setViewing(null); setComment(''); setDecideError(''); }}>
            Close
          </Button>
          {myDecision && viewing?.status === 'pending' && (
            <Button
              variant="contained"
              color={action === 'approve' ? 'success' : 'error'}
              disabled={decide.isLoading || (action === 'reject' && !comment.trim())}
              onClick={() => decide.mutate()}>
              {decide.isLoading ? 'Submitting…' : action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
