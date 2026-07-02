/**
 * ProcessActionPanel — the end-user "Next Step" surface for a process-backed
 * case. Given a process-instance id, it resolves the actionable task (the
 * caller's active task, else an unclaimed pool task) and renders ONLY what an
 * end user needs to advance the flow: the dynamic step form plus
 * Claim / Complete / Reject / Reassign.
 *
 * Deliberately omits the BPMN diagram, token view, process-journey timeline and
 * raw variable JSON — those live in the designer-only Process Monitor. This lets
 * a process-backed case look and behave like any normal case.
 *
 * Self-contained (its own queries/mutations) so it can be dropped into
 * CaseDetail without coupling to WorkItemDetail. `onChanged` fires after any
 * mutation so the host (CaseDetail) can refetch the case (status may advance).
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Button, CircularProgress,
  Divider, Alert, TextField, Stack, Autocomplete,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { useQuery, useQueryClient } from 'react-query';
import { processApi, orgApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { format } from 'date-fns';
import { DynField, buildInitialValues, isFormComplete, getFormSchema } from '../process-studio/startFormHelpers';
import { useTaskActions } from './useTaskActions';

export default function ProcessActionPanel({
  processInstanceId,
  onChanged,
}: {
  processInstanceId: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [completeOpen, setCompleteOpen] = useState(false);
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignUser, setReassignUser] = useState<any>(null);
  const [formValues,   setFormValues]   = useState<Record<string, string>>({});

  const { data: instance } = useQuery(
    ['proc-panel-instance', processInstanceId],
    () => processApi.getInstance(processInstanceId),
    { enabled: !!processInstanceId },
  );
  const { data: tasksData, isLoading: tasksLoading } = useQuery(
    ['proc-panel-tasks', processInstanceId],
    () => processApi.listTasks({ instanceId: processInstanceId }, 1, 100),
    { enabled: !!processInstanceId },
  );
  const { data: usersData } = useQuery('users-all', () => orgApi.getUsers(1, 200), { enabled: reassignOpen });
  const users = usersData?.data || [];

  const allTasks = [...(tasksData?.data || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const myActiveTask = allTasks.find(t =>
    ['pending', 'in_progress'].includes(t.status) && t.assignee_id === user?.id);
  const poolTask = allTasks.find(t => t.status === 'pending' && !t.assignee_id);
  const subjectTask = myActiveTask || poolTask;
  const formFields = getFormSchema(subjectTask?.variables);

  useEffect(() => {
    if (subjectTask) setFormValues(buildInitialValues(getFormSchema(subjectTask.variables)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectTask?.id]);

  const invalidate = () => {
    qc.invalidateQueries(['proc-panel-instance', processInstanceId]);
    qc.invalidateQueries(['proc-panel-tasks', processInstanceId]);
    onChanged?.();
  };

  const { claim, complete, reject, reassign, error: actionError, setError: setActionError } =
    useTaskActions(subjectTask?.id, { onChanged: invalidate });

  if (tasksLoading) {
    return (
      <Card sx={{ mb: 3 }}><CardContent>
        <Box display="flex" alignItems="center" gap={1.5}><CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Loading next step…</Typography></Box>
      </CardContent></Card>
    );
  }

  // Process finished (or no instance yet) — nothing for the user to act on.
  const instClosed = instance && !['active', 'suspended'].includes(instance.status);
  if (!subjectTask) {
    if (instClosed) {
      return (
        <Card sx={{ mb: 3 }}><CardContent>
          <Typography variant="h6" mb={1}>Workflow</Typography>
          <Alert severity={instance.status === 'completed' ? 'success' : 'info'}>
            All steps are complete{instance.status === 'completed' ? '' : ` — workflow is ${instance.status}`}.
          </Alert>
        </CardContent></Card>
      );
    }
    return null; // active but no actionable task right now (e.g. assigned to someone else / service task)
  }

  const isMine   = subjectTask.assignee_id === user?.id;
  const isActive = ['pending', 'in_progress'].includes(subjectTask.status);
  const canAct   = isActive && isMine;
  const canClaim = subjectTask.status === 'pending' && !isMine && !subjectTask.assignee_id;
  const slaLabel = subjectTask.due_at
    ? (new Date(subjectTask.due_at) < new Date() ? 'SLA breached' : `Due ${format(new Date(subjectTask.due_at), 'dd MMM HH:mm')}`)
    : null;

  return (
    <Card sx={{ mb: 3, border: '1px solid', borderColor: 'primary.main' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5} flexWrap="wrap" gap={1}>
          <Typography variant="h6" color="primary">Next Step: {subjectTask.name}</Typography>
          {slaLabel && (
            <Chip size="small" label={slaLabel}
              color={subjectTask.due_at && new Date(subjectTask.due_at) < new Date() ? 'error' : 'default'} />
          )}
        </Box>

        {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}

        {canClaim && (
          <Box mb={1}>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              This step is waiting to be claimed. Claim it to start working.
            </Typography>
            <Button variant="contained" startIcon={<AssignmentIndIcon />} disabled={claim.isLoading}
              onClick={() => claim.mutate()}>
              {claim.isLoading ? 'Claiming…' : 'Claim This Step'}
            </Button>
          </Box>
        )}

        {canAct && (
          <>
            {formFields.length > 0 && (
              <Box display="flex" flexDirection="column" gap={2} mb={2.5}>
                <Typography variant="body2" color="text.secondary">
                  Fill in the required fields to complete this step.
                </Typography>
                {formFields.map(f => (
                  <DynField key={f.key} field={f} value={formValues[f.key] ?? ''}
                    onChange={v => setFormValues(prev => ({ ...prev, [f.key]: v }))} />
                ))}
              </Box>
            )}
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                disabled={complete.isLoading || !isFormComplete(formFields, formValues)}
                onClick={() => setCompleteOpen(true)}>Complete</Button>
              <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                disabled={reject.isLoading} onClick={() => setRejectOpen(true)}>Reject</Button>
              <Button variant="outlined" startIcon={<PersonIcon />}
                disabled={reassign.isLoading} onClick={() => setReassignOpen(true)}>Reassign</Button>
            </Stack>
          </>
        )}

        {!canAct && !canClaim && (
          <Alert severity="info">
            This step (<strong>{subjectTask.name}</strong>) is assigned to another team member.
          </Alert>
        )}
      </CardContent>

      {/* Complete */}
      <Dialog open={completeOpen} onClose={() => setCompleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Complete Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Mark <strong>{subjectTask.name}</strong> as completed? The case will advance to the next step.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={complete.isLoading}
            onClick={() => complete.mutate(formValues, { onSuccess: () => setCompleteOpen(false) })}>
            {complete.isLoading ? 'Completing…' : 'Complete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Reject <strong>{subjectTask.name}</strong> and provide a reason (optional).
          </Typography>
          <TextField fullWidth size="small" multiline rows={3} label="Reason for rejection"
            value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={reject.isLoading}
            onClick={() => reject.mutate({ variables: formValues, reason: rejectReason }, { onSuccess: () => setRejectOpen(false) })}>
            {reject.isLoading ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reassign */}
      <Dialog open={reassignOpen} onClose={() => setReassignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reassign Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Reassign <strong>{subjectTask.name}</strong> to another team member.
          </Typography>
          <Autocomplete options={users}
            getOptionLabel={(u: any) => u.full_name || u.email || u.id}
            value={reassignUser} onChange={(_, v) => setReassignUser(v)}
            renderInput={p => <TextField {...p} size="small" label="Assign to" />} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!reassignUser || reassign.isLoading}
            onClick={() => reassign.mutate(reassignUser?.id, { onSuccess: () => { setReassignOpen(false); setReassignUser(null); } })}>
            {reassign.isLoading ? 'Reassigning…' : 'Reassign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
