/**
 * WorkItemDetail — unified work page for a single task or a whole request.
 *
 *   mode="task"    → route /tasks/:id     (id is a task id)
 *   mode="request" → route /requests/:id  (id is a process-instance id)
 *
 * Both modes render the same surface (journey, stepper, collected data,
 * discussion, and the claim/complete/reject/reassign actions). The only
 * difference is how the "subject task" — the task the user acts on — is
 * resolved: in task mode it is the task itself; in request mode it is the
 * instance's active (mine) or pool (unassigned) task.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Chip, Button, CircularProgress,
  Grid, Divider, Alert, TextField, Avatar, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete,
  Stack, Paper, Stepper, Step, StepLabel, LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FlagIcon from '@mui/icons-material/Flag';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { processApi, orgApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { DynField, buildInitialValues, isFormComplete, getFormSchema } from '../process-studio/startFormHelpers';
import { useTaskActions } from './useTaskActions';

// ── Helpers ───────────────────────────────────────────────────────────────────

const INST_STATUS_COLORS: Record<string, any> = {
  active: 'primary', completed: 'success', suspended: 'warning', terminated: 'error',
};
const TASK_STATUS_COLORS: Record<string, any> = {
  pending: 'warning', in_progress: 'primary', completed: 'success',
  cancelled: 'default', escalated: 'error',
};
const STEP_ICONS: Record<string, React.ReactElement> = {
  completed:   <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />,
  cancelled:   <CancelIcon sx={{ color: 'text.disabled', fontSize: 20 }} />,
  in_progress: <PlayArrowIcon sx={{ color: 'primary.main', fontSize: 20 }} />,
  pending:     <HourglassEmptyIcon sx={{ color: 'text.secondary', fontSize: 20 }} />,
  escalated:   <FlagIcon sx={{ color: 'error.main', fontSize: 20 }} />,
};

function userName(users: any[], id?: string) {
  if (!id) return '—';
  const u = users.find(u => u.id === id);
  return u ? (u.full_name || u.email || id.slice(0, 8)) : id.slice(0, 8);
}

function publicVars(variables: any): Record<string, any> {
  if (!variables) return {};
  return Object.fromEntries(Object.entries(variables).filter(([k]) => !k.startsWith('_')));
}

// Aggregate public variables from all tasks (later steps override earlier)
function aggregateVars(tasks: any[]): Record<string, any> {
  const merged: Record<string, any> = {};
  for (const t of tasks) Object.assign(merged, publicVars(t.variables || {}));
  return merged;
}

// Aggregate comments from all tasks, sorted by timestamp, tagged with step name
function aggregateComments(tasks: any[]): Array<{ userId: string; message: string; createdAt: string; stepName: string }> {
  return tasks
    .flatMap(t =>
      (Array.isArray(t.comments) ? t.comments : []).map((c: any) => ({ ...c, stepName: t.name }))
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// ── Comment bubble ─────────────────────────────────────────────────────────────

function CommentBubble({ comment, users }: { comment: any; users: any[] }) {
  const name = userName(users, comment.userId);
  const initial = name[0]?.toUpperCase() || '?';
  return (
    <Box display="flex" gap={1.5} mb={2}>
      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main', flexShrink: 0 }}>{initial}</Avatar>
      <Box flex={1} minWidth={0}>
        <Box display="flex" alignItems="baseline" gap={1} mb={0.25} flexWrap="wrap">
          <Typography variant="body2" fontWeight={600}>{name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </Typography>
          {comment.stepName && <Chip label={comment.stepName} size="small" sx={{ height: 16, fontSize: 10 }} />}
        </Box>
        <Paper variant="outlined" sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: 'grey.50' }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{comment.message}</Typography>
        </Paper>
      </Box>
    </Box>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WorkItemDetail({ mode }: { mode: 'task' | 'request' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  // ── State ─────────────────────────────────────────────────────────────────
  const [commentText,  setCommentText]  = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignUser, setReassignUser] = useState<any>(null);
  const [formValues,   setFormValues]   = useState<Record<string, string>>({});

  // ── Queries ───────────────────────────────────────────────────────────────
  // Task mode resolves the instance from the task; request mode uses the id directly.
  const { data: task, isLoading: taskLoading } = useQuery(
    ['task', id],
    () => processApi.getTask(id!),
    { enabled: mode === 'task' && !!id },
  );

  const instanceId = mode === 'task' ? task?.process_instance_id : id;

  const { data: instance, isLoading: instLoading, refetch: refetchInstance } = useQuery(
    ['instance', instanceId],
    () => processApi.getInstance(instanceId!),
    { enabled: !!instanceId },
  );

  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useQuery(
    ['instance-tasks', instanceId],
    () => processApi.listTasks({ instanceId }, 1, 100),
    { enabled: !!instanceId },
  );

  const { data: usersData } = useQuery('users-all', () => orgApi.getUsers(1, 200));
  const users = usersData?.data || [];

  // ── Derived ───────────────────────────────────────────────────────────────
  const allTasks = [...(tasksData?.data || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const myActiveTask = allTasks.find(t =>
    ['pending', 'in_progress'].includes(t.status) && t.assignee_id === user?.id);
  const poolTask = allTasks.find(t => t.status === 'pending' && !t.assignee_id);

  // The task the user acts on. Task mode: the specific task (fresh copy from the
  // list when available). Request mode: my active task, else a pool task.
  const subjectTask = mode === 'task'
    ? (allTasks.find(t => t.id === task?.id) || task)
    : (myActiveTask || poolTask);

  const formFields    = getFormSchema(subjectTask?.variables);
  const collectedVars = aggregateVars(allTasks);
  const allComments   = aggregateComments(allTasks);
  const initialVars   = publicVars(allTasks[0]?.variables || {});
  const commentTargetId = subjectTask?.id || allTasks[allTasks.length - 1]?.id;

  useEffect(() => {
    if (subjectTask) setFormValues(buildInitialValues(getFormSchema(subjectTask.variables)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectTask?.id]);

  // Converge the legacy "/requests/:id" surface: a process-backed request is now
  // a case, so send the user to the unified case view. Standalone instances
  // (no linked case) still render here.
  useEffect(() => {
    if (mode === 'request' && instance?.case_id) {
      navigate(`/cases/${instance.case_id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, instance?.case_id]);

  const refetch = () => { refetchInstance(); refetchTasks(); };
  const invalidate = () => {
    qc.invalidateQueries(['instance', instanceId]);
    qc.invalidateQueries(['instance-tasks', instanceId]);
    if (mode === 'task') qc.invalidateQueries(['task', id]);
    qc.invalidateQueries(['tasks']);
  };

  // ── Task actions (claim/complete/reject/reassign) — shared contract ─────────
  const { claim, complete, reject, reassign, error: actionError, setError: setActionError } =
    useTaskActions(subjectTask?.id, { onChanged: invalidate });

  const commentMut = useMutation(
    (msg: string) => processApi.addTaskComment(commentTargetId!, msg),
    {
      onSuccess: () => { invalidate(); setCommentText(''); },
      onError: (e: any) => setActionError(e.response?.data?.message || e.message),
    },
  );

  // ── Loading / error ─────────────────────────────────────────────────────────
  const loading = (mode === 'task' && taskLoading) || (!!instanceId && (instLoading || tasksLoading));
  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  if (mode === 'task' && !task) return <Alert severity="error">Task not found.</Alert>;
  if (!instance) return <Alert severity="error">{mode === 'task' ? 'Task' : 'Request'} not found.</Alert>;

  // ── Action gating ─────────────────────────────────────────────────────────
  const isMine   = subjectTask?.assignee_id === user?.id;
  const isActive = !!subjectTask && ['pending', 'in_progress'].includes(subjectTask.status);
  const canAct   = isActive && isMine;
  const canClaim = subjectTask?.status === 'pending' && !isMine && !subjectTask?.assignee_id;
  const busy     = claim.isLoading || complete.isLoading;

  // Pool tasks can be filled before claiming. Submitting claims the task first
  // (so the handler is recorded in the journey) and then completes it.
  const confirmComplete = () => {
    const done = () => setCompleteOpen(false);
    if (isMine) complete.mutate(formValues, { onSuccess: done });
    else claim.mutate(undefined, { onSuccess: () => complete.mutate(formValues, { onSuccess: done }) });
  };

  const isRequestOpen = ['active', 'suspended'].includes(instance.status);
  const isSLA    = subjectTask?.due_at;
  const slaLabel = isSLA
    ? (new Date(subjectTask.due_at) < new Date() ? 'SLA Breached' : `Due ${format(new Date(subjectTask.due_at), 'dd MMM HH:mm')}`)
    : null;

  // Header title differs by mode
  const title = mode === 'task'
    ? subjectTask?.name
    : (instance.business_key || `${instance.definition_name} #${instance.id.slice(0, 6)}`);
  const subtitle = mode === 'task'
    ? `${instance.definition_name}${instance.business_key ? ` · #${instance.business_key}` : ''}`
    : instance.definition_name;
  const backTo = mode === 'task' ? '/workplace?tab=tasks' : '/workplace?tab=requests';

  // ── Stage stepper: unique task names in order ───────────────────────────────
  const uniqueSteps = Array.from(new Map(allTasks.map(t => [t.name, t])).values());
  const activeStepIndex = uniqueSteps.findIndex(t => t.id === subjectTask?.id);
  const completedCount = allTasks.filter(t => t.status === 'completed').length;
  const progressPct = allTasks.length > 0
    ? (instance.status === 'completed' ? 100 : Math.round((completedCount / allTasks.length) * 100))
    : 0;

  return (
    <Box>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <Tooltip title="Back to Workplace">
          <IconButton onClick={() => navigate(backTo)} size="small"><ArrowBackIcon /></IconButton>
        </Tooltip>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {/* ── Stage stepper ───────────────────────────────────────────────── */}
      {uniqueSteps.length > 1 && (
        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ py: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="body2" fontWeight={600}>
                {instance.status === 'completed' ? 'Request Completed' : `In Progress — ${subjectTask?.name || 'Processing'}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">{progressPct}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={progressPct}
              color={instance.status === 'completed' ? 'success' : 'primary'}
              sx={{ height: 6, borderRadius: 1, mb: 2 }} />
            <Stepper activeStep={activeStepIndex >= 0 ? activeStepIndex : (instance.status === 'completed' ? uniqueSteps.length : 0)} alternativeLabel>
              {uniqueSteps.map(step => (
                <Step key={step.id} completed={step.status === 'completed'}>
                  <StepLabel><Typography variant="caption">{step.name}</Typography></StepLabel>
                </Step>
              ))}
            </Stepper>
          </CardContent>
        </Card>
      )}

      {/* ── Meta card ──────────────────────────────────────────────────── */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" flexWrap="wrap" gap={3} alignItems="center">
            <Box>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Box><Chip label={instance.status} size="small" color={INST_STATUS_COLORS[instance.status] || 'default'} /></Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Submitted</Typography>
              <Typography variant="body2">{format(new Date(instance.started_at), 'dd MMM yyyy HH:mm')}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Submitted By</Typography>
              <Typography variant="body2">{userName(users, instance.initiator_id)}</Typography>
            </Box>
            {subjectTask && (
              <Box>
                <Typography variant="caption" color="text.secondary">Current Step</Typography>
                <Typography variant="body2" fontWeight={500}>{subjectTask.name}</Typography>
              </Box>
            )}
            {slaLabel && (
              <Box>
                <Typography variant="caption" color="text.secondary">SLA</Typography>
                <Typography variant="body2" color={subjectTask?.sla_breached ? 'error.main' : 'text.primary'}
                  fontWeight={subjectTask?.sla_breached ? 600 : 400}>{slaLabel}</Typography>
              </Box>
            )}
            <Box flex={1} />
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {allTasks.length} step{allTasks.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}

      <Grid container spacing={3}>
        {/* ── Left column ─────────────────────────────────────────────── */}
        <Grid item xs={12} md={8}>

          {/* Process Journey */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Process Journey</Typography>

              {allTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No steps recorded yet.</Typography>
              ) : (
                allTasks.map((step: any, idx: number) => {
                  const isCurrent = step.id === subjectTask?.id;
                  const isLast = idx === allTasks.length - 1;
                  const varEntries = Object.entries(publicVars(step.variables || {}));

                  return (
                    <Box key={step.id} display="flex" gap={2}>
                      {/* Timeline */}
                      <Box display="flex" flexDirection="column" alignItems="center" width={24} flexShrink={0}>
                        <Box mt={0.5}>{STEP_ICONS[step.status] || STEP_ICONS['pending']}</Box>
                        {!isLast && <Box flex={1} width={2} bgcolor="divider" my={0.5} minHeight={28} />}
                      </Box>

                      {/* Step card */}
                      <Box flex={1} mb={2} p={1.5} borderRadius={1} sx={
                        isCurrent
                          ? { bgcolor: 'primary.50', border: '2px solid', borderColor: 'primary.main' }
                          : { bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }
                      }>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap">
                          <Box>
                            <Box display="flex" alignItems="center" gap={0.75}>
                              <Typography variant="body2" fontWeight={600}>{step.name}</Typography>
                              {isCurrent && <Chip label="Current" size="small" color="primary" sx={{ height: 18, fontSize: 10 }} />}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {userName(users, step.assignee_id)} · {format(new Date(step.created_at), 'dd MMM yyyy HH:mm')}
                            </Typography>
                          </Box>
                          <Chip label={step.status.replace('_', ' ')} size="small" color={TASK_STATUS_COLORS[step.status] || 'default'} />
                        </Box>

                        {step.outcome && (
                          <Box mt={0.75}>
                            <Chip label={`Outcome: ${step.outcome}`} size="small"
                              color={step.outcome === 'approved' || step.outcome === 'completed' ? 'success' : step.outcome === 'rejected' ? 'error' : 'default'}
                              sx={{ height: 20, fontSize: 11 }} />
                          </Box>
                        )}

                        {varEntries.length > 0 && (
                          <Box mt={1} display="flex" flexWrap="wrap" gap={0.5}>
                            {varEntries.slice(0, 6).map(([k, v]) => (
                              <Typography key={k} variant="caption" sx={{
                                bgcolor: 'white', border: '1px solid', borderColor: 'divider',
                                borderRadius: 1, px: 0.75, py: 0.25,
                              }}>
                                <strong>{k}:</strong> {String(v).slice(0, 50)}
                              </Typography>
                            ))}
                            {varEntries.length > 6 && (
                              <Typography variant="caption" color="text.secondary">+{varEntries.length - 6} more</Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Work Area */}
          {(subjectTask || isRequestOpen) && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} mb={2}>
                  {canAct ? `Complete Step: ${subjectTask.name}` : canClaim ? `Work on Step: ${subjectTask.name}` : 'Summary'}
                </Typography>

                {/* Pool task: fillable before claiming */}
                {canClaim && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    This step is in your team's queue. Fill it in and submit — you'll be recorded as the handler — or just claim it to work on later.
                  </Alert>
                )}

                {/* Dynamic form for current step — shown for the assignee and for
                    claimable pool tasks (fill-then-claim) */}
                {(canAct || canClaim) && formFields.length > 0 && (
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

                {/* Action buttons — assignee */}
                {canAct && (
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                      disabled={complete.isLoading || !isFormComplete(formFields, formValues)}
                      onClick={() => setCompleteOpen(true)}>
                      Complete
                    </Button>
                    <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                      disabled={reject.isLoading}
                      onClick={() => setRejectOpen(true)}>
                      Reject
                    </Button>
                    <Button variant="outlined" startIcon={<PersonIcon />}
                      disabled={reassign.isLoading}
                      onClick={() => setReassignOpen(true)}>
                      Reassign
                    </Button>
                  </Stack>
                )}

                {/* Action buttons — pool task (claim + complete in one step, or just claim) */}
                {canClaim && (
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                      disabled={busy || !isFormComplete(formFields, formValues)}
                      onClick={() => setCompleteOpen(true)}>
                      Claim &amp; Complete
                    </Button>
                    <Button variant="outlined" startIcon={<AssignmentIndIcon />}
                      disabled={busy}
                      onClick={() => claim.mutate()}>
                      {claim.isLoading ? 'Claiming…' : 'Just Claim'}
                    </Button>
                  </Stack>
                )}

                {/* Closed / not actionable */}
                {!canAct && !canClaim && (
                  subjectTask && ['completed', 'cancelled'].includes(subjectTask.status) ? (
                    <Alert severity={subjectTask.status === 'completed' ? 'success' : 'warning'}>
                      This step was <strong>{subjectTask.status}</strong>
                      {subjectTask.outcome ? ` with outcome: ${subjectTask.outcome}` : ''}
                      {subjectTask.completed_at ? ` on ${format(new Date(subjectTask.completed_at), 'dd MMM yyyy HH:mm')}` : ''}.
                    </Alert>
                  ) : (
                    <Alert severity={instance.status === 'completed' ? 'success' : instance.status === 'terminated' ? 'warning' : 'info'}>
                      This request is <strong>{instance.status}</strong>.
                      {instance.completed_at ? ` Closed on ${format(new Date(instance.completed_at), 'dd MMM yyyy HH:mm')}.` : ''}
                    </Alert>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>

          {/* Your Request summary */}
          {Object.keys(initialVars).length > 0 && (
            <Card variant="outlined" sx={{ mb: 3, border: '1px solid', borderColor: 'primary.100', bgcolor: 'primary.50' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} mb={1.5} color="primary.dark">
                  Your Request
                </Typography>
                {Object.entries(initialVars).map(([k, v]) => (
                  <Box key={k} display="flex" py={0.75} borderBottom="1px solid" sx={{ borderColor: 'primary.100' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120, flexShrink: 0, textTransform: 'capitalize' }}>
                      {k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                    </Typography>
                    <Typography variant="caption" fontWeight={500} sx={{ wordBreak: 'break-all', ml: 1 }}>{String(v)}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Collected Data */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={1.5}>Collected Data</Typography>
              {Object.keys(collectedVars).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No data collected yet.</Typography>
              ) : (
                Object.entries(collectedVars).map(([k, v]) => (
                  <Box key={k} display="flex" py={0.75} borderBottom="1px solid" sx={{ borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110, flexShrink: 0 }}>{k}</Typography>
                    <Typography variant="caption" sx={{ wordBreak: 'break-all', ml: 1 }}>{String(v)}</Typography>
                  </Box>
                ))
              )}
            </CardContent>
          </Card>

          {/* Discussion */}
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Discussion {allComments.length > 0 && `(${allComments.length})`}
              </Typography>

              {allComments.length === 0 && (
                <Typography variant="body2" color="text.secondary" mb={2}>No comments yet.</Typography>
              )}

              {allComments.map((c, i) => <CommentBubble key={i} comment={c} users={users} />)}

              <Divider sx={{ my: 1.5 }} />

              <Box display="flex" gap={1} alignItems="flex-end">
                <TextField fullWidth size="small" multiline maxRows={4}
                  placeholder="Add a note or comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  disabled={!commentTargetId}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) {
                      e.preventDefault();
                      commentMut.mutate(commentText.trim());
                    }
                  }}
                />
                <Tooltip title="Send (Enter)">
                  <span>
                    <IconButton color="primary" size="small"
                      disabled={!commentText.trim() || commentMut.isLoading || !commentTargetId}
                      onClick={() => commentText.trim() && commentMut.mutate(commentText.trim())}>
                      {commentMut.isLoading ? <CircularProgress size={18} /> : <SendIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Complete Dialog ─────────────────────────────────────────────── */}
      <Dialog open={completeOpen} onClose={() => setCompleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{canClaim ? 'Claim & Complete Step' : 'Complete Step'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {canClaim
              ? <>You'll be assigned as the handler of <strong>{subjectTask?.name}</strong> and it will be marked completed. The process advances to the next step.</>
              : <>Mark <strong>{subjectTask?.name}</strong> as completed? The process will advance to the next step.</>}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={busy}
            onClick={confirmComplete}>
            {busy ? 'Completing…' : canClaim ? 'Claim & Complete' : 'Complete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reject Dialog ───────────────────────────────────────────────── */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Reject <strong>{subjectTask?.name}</strong> and provide a reason (optional).
          </Typography>
          <TextField fullWidth size="small" multiline rows={3}
            label="Reason for rejection"
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={reject.isLoading}
            onClick={() => reject.mutate({ variables: formValues, reason: rejectReason }, { onSuccess: () => setRejectOpen(false) })}>
            {reject.isLoading ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reassign Dialog ─────────────────────────────────────────────── */}
      <Dialog open={reassignOpen} onClose={() => setReassignOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reassign Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Reassign <strong>{subjectTask?.name}</strong> to another team member.
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
    </Box>
  );
}
