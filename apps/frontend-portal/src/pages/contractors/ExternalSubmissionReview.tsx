import React, { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Paper, Chip, Divider, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress,
  Avatar, IconButton, Tooltip, Grid,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText,
  ListItemIcon,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CommentIcon from '@mui/icons-material/Comment';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { contractorApi } from '../../api/client';
import WorkOrderDispatch from './WorkOrderDispatch';
import BackButton from '../../components/BackButton';

interface Assignment {
  id: string;
  work_order_ref: string;
  case_id: string;
  case_number?: string;
  case_title?: string;
  company_id: string;
  company_name?: string;
  user_id?: string;
  user_name?: string;
  assignment_type: string;
  assignment_status: 'pending' | 'accepted' | 'in_progress' | 'submitted' | 'rework_required' | 'completed' | 'cancelled';
  due_at: string;
  sla_hours: number;
  instructions: string;
  rework_count: number;
  created_at: string;
  updated_at: string;
  submissions?: Submission[];
  comments?: Comment[];
}

interface Submission {
  id: string;
  submission_type: 'start' | 'progress' | 'completion' | 'rework';
  notes: string;
  evidence: Record<string, any>;
  attachments?: Attachment[];
  submitted_at: string;
  submitted_by_name?: string;
}

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
}

interface Comment {
  id: string;
  body: string;
  author_name: string;
  is_internal: boolean;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary'> = {
  pending: 'warning',
  accepted: 'info',
  in_progress: 'primary',
  submitted: 'info',
  rework_required: 'warning',
  completed: 'success',
  cancelled: 'error',
};

interface ExternalSubmissionReviewProps {
  assignmentId?: string;
}

export default function ExternalSubmissionReview({ assignmentId }: ExternalSubmissionReviewProps) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(assignmentId || '');
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [error, setError] = useState('');
  const [rsDate, setRsDate] = useState('');
  const [rsNote, setRsNote] = useState('');

  const { data: assignments = [], isLoading: listLoading } = useQuery<Assignment[]>(
    'contractor-assignments',
    () => contractorApi.getAssignments({ status: 'submitted,rework_required,in_progress' }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    { enabled: !assignmentId },
  );

  const { data: assignment, isLoading } = useQuery<Assignment>(
    ['contractor-assignment', selectedId],
    () => contractorApi.getAssignment(selectedId).then(r => r.data),
    { enabled: !!selectedId, refetchInterval: 30_000 },
  );

  const approveMutation = useMutation(
    (id: string) => contractorApi.approve(id),
    {
      onSuccess: () => { qc.invalidateQueries(['contractor-assignment', selectedId]); qc.invalidateQueries('contractor-assignments'); },
      onError: (e: any) => setError(e.response?.data?.message || 'Approve failed'),
    },
  );

  const rescheduleMutation = useMutation(
    ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      contractorApi.respondReschedule(id, { decision, new_due_at: decision === 'approve' ? (rsDate || null) : null, note: rsNote || null }),
    {
      onSuccess: () => { qc.invalidateQueries(['contractor-assignment', selectedId]); qc.invalidateQueries('contractor-assignments'); setRsDate(''); setRsNote(''); },
      onError: (e: any) => setError(e.response?.data?.message || 'Reschedule decision failed'),
    },
  );

  const reworkMutation = useMutation(
    ({ id, reason }: { id: string; reason: string }) => contractorApi.requestRework(id, reason),
    {
      onSuccess: () => {
        qc.invalidateQueries(['contractor-assignment', selectedId]);
        qc.invalidateQueries('contractor-assignments');
        setReworkDialogOpen(false);
        setReworkReason('');
      },
      onError: (e: any) => setError(e.response?.data?.message || 'Rework request failed'),
    },
  );

  const commentMutation = useMutation(
    (body: string) => contractorApi.addComment(selectedId, body, false),
    {
      onSuccess: () => { qc.invalidateQueries(['contractor-assignment', selectedId]); setCommentBody(''); },
      onError: (e: any) => setError(e.response?.data?.message || 'Failed to send comment'),
    },
  );

  if (!assignmentId && !selectedId) {
    // Show assignment list
    return (
      <Box>
        <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Submission Review</Typography>
        {listLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {assignments.length === 0 && (
              <Alert severity="info">No assignments pending review.</Alert>
            )}
            {assignments.map(a => (
              <Card key={a.id} sx={{ cursor: 'pointer' }} onClick={() => setSelectedId(a.id)}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>{a.work_order_ref}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {a.case_number} — {a.case_title}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip label={a.company_name} size="small" icon={<BusinessIcon />} />
                        {a.user_name && <Chip label={a.user_name} size="small" icon={<PersonIcon />} />}
                      </Box>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Chip label={a.assignment_status.replace('_', ' ')} size="small" color={STATUS_COLORS[a.assignment_status] || 'default'} />
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                        Due: {new Date(a.due_at).toLocaleDateString()}
                      </Typography>
                      {a.rework_count > 0 && (
                        <Chip label={`${a.rework_count} rework${a.rework_count > 1 ? 's' : ''}`} size="small" color="warning" sx={{ mt: 0.5 }} />
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (isLoading || !assignment) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }

  const canApprove = ['submitted'].includes(assignment.assignment_status);
  const canRework = ['submitted', 'in_progress'].includes(assignment.assignment_status);

  return (
    <Box>
      {!assignmentId && (
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => setSelectedId('')} sx={{ mb: 2 }}>Back to list</Button>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Header */}
      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="h6" fontWeight={700}>{assignment.work_order_ref}</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {assignment.case_number} — {assignment.case_title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={assignment.company_name || 'Unknown Co.'} size="small" icon={<BusinessIcon />} variant="outlined" />
              {assignment.user_name && <Chip label={assignment.user_name} size="small" icon={<PersonIcon />} variant="outlined" />}
              <Chip label={`Type: ${assignment.assignment_type}`} size="small" variant="outlined" />
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box>
              <Chip
                label={assignment.assignment_status.replace('_', ' ')}
                color={STATUS_COLORS[assignment.assignment_status] || 'default'}
                sx={{ mb: 1 }}
              />
              {assignment.rework_count > 0 && (
                <Chip label={`${assignment.rework_count} rework(s)`} color="warning" size="small" sx={{ ml: 1, mb: 1 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Due: {new Date(assignment.due_at).toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={() => approveMutation.mutate(assignment.id)}
                disabled={!canApprove || approveMutation.isLoading}
                fullWidth
              >
                Approve & Close
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<ReplayIcon />}
                onClick={() => setReworkDialogOpen(true)}
                disabled={!canRework}
                fullWidth
              >
                Request Rework
              </Button>
              <Button
                variant="outlined"
                color="info"
                startIcon={<SwapHorizIcon />}
                onClick={() => setReassignOpen(true)}
                fullWidth
              >
                Reassign
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Pending reschedule request */}
      {(assignment as any).reschedule_id && (
        <Paper sx={{ p: 2.5, mb: 2, borderLeft: '4px solid', borderColor: 'warning.main' }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>📅 Reschedule requested</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            New date requested: <strong>{new Date((assignment as any).reschedule_requested_date).toLocaleString()}</strong><br />
            Reason: {(assignment as any).reschedule_reason || '—'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" type="datetime-local" label="New due date (on approve)" InputLabelProps={{ shrink: true }}
              value={rsDate || String((assignment as any).reschedule_requested_date || '').slice(0, 16)}
              onChange={e => setRsDate(e.target.value)} />
            <TextField size="small" label="Note to contractor" sx={{ flex: 1, minWidth: 200 }}
              value={rsNote} onChange={e => setRsNote(e.target.value)} />
            <Button variant="contained" color="success" disabled={rescheduleMutation.isLoading}
              onClick={() => rescheduleMutation.mutate({ id: assignment.id, decision: 'approve' })}>Approve</Button>
            <Button variant="outlined" color="error" disabled={rescheduleMutation.isLoading}
              onClick={() => rescheduleMutation.mutate({ id: assignment.id, decision: 'reject' })}>Reject</Button>
          </Box>
        </Paper>
      )}

      {/* Submissions Timeline */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={700}>
            Submission Timeline ({(assignment.submissions || []).length} submission{(assignment.submissions || []).length !== 1 ? 's' : ''})
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {(!assignment.submissions || assignment.submissions.length === 0) ? (
            <Typography color="text.secondary" variant="body2">No submissions yet.</Typography>
          ) : (
            <List>
              {assignment.submissions.map((sub: any, idx: number) => (
                <React.Fragment key={sub.id || idx}>
                  <ListItem alignItems="flex-start" sx={{ pl: 0 }}>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between">
                          <Chip label={sub.submission_type?.replace(/_/g, ' ')} size="small" color={sub.submission_type === 'completion' ? 'success' : 'primary'} />
                          <Typography variant="caption" color="text.secondary">{new Date(sub.submitted_at).toLocaleString()}</Typography>
                        </Box>
                      }
                      secondary={
                        <Box mt={0.5}>
                          {sub.submitted_by_name && <Typography variant="caption" display="block" color="primary">{sub.submitted_by_name}</Typography>}
                          {sub.notes && <Typography variant="body2">{sub.notes}</Typography>}
                          {sub.evidence && Object.keys(sub.evidence).length > 0 && Object.entries(sub.evidence).map(([k, v]) => (
                            <Typography key={k} variant="caption" display="block"><b>{k}:</b> {String(v)}</Typography>
                          ))}
                        </Box>
                      }
                    />
                  </ListItem>
                  {idx < (assignment.submissions || []).length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </AccordionDetails>
      </Accordion>

      {/* Instructions */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" fontWeight={700}>Work Instructions</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {assignment.instructions || 'No instructions provided.'}
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Comments */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CommentIcon fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700}>
              Communication Thread ({(assignment.comments || []).length})
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
            {(!assignment.comments || assignment.comments.length === 0) && (
              <Typography color="text.secondary" variant="body2">No comments yet.</Typography>
            )}
            {(assignment.comments || []).map((c, idx) => (
              <Box key={c.id || idx} sx={{ display: 'flex', gap: 1.5 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: c.is_internal ? 'primary.main' : 'secondary.main', fontSize: 13 }}>
                  {c.author_name?.[0] || '?'}
                </Avatar>
                <Paper variant="outlined" sx={{ p: 1.5, flex: 1, bgcolor: c.is_internal ? 'action.hover' : 'background.paper' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600}>{c.author_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(c.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography variant="body2">{c.body}</Typography>
                  {c.is_internal && <Chip label="Internal" size="small" variant="outlined" sx={{ mt: 0.5 }} />}
                </Paper>
              </Box>
            ))}
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              placeholder="Add a comment..."
              fullWidth
              size="small"
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && commentBody.trim()) {
                  e.preventDefault();
                  commentMutation.mutate(commentBody);
                }
              }}
            />
            <Button
              variant="contained"
              size="small"
              disabled={!commentBody.trim()}
              onClick={() => commentMutation.mutate(commentBody)}
            >
              Send
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Rework Dialog */}
      <Dialog open={reworkDialogOpen} onClose={() => setReworkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Rework</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Explain what needs to be corrected or completed by the contractor.
          </Typography>
          <TextField
            label="Rework Reason"
            fullWidth
            multiline
            rows={4}
            value={reworkReason}
            onChange={e => setReworkReason(e.target.value)}
            placeholder="Describe the issue and what the contractor needs to address..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReworkDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<ReplayIcon />}
            disabled={!reworkReason.trim() || reworkMutation.isLoading}
            onClick={() => reworkMutation.mutate({ id: assignment.id, reason: reworkReason })}
          >
            Send Rework Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reassign Dialog */}
      <WorkOrderDispatch
        open={reassignOpen}
        caseId={assignment.case_id}
        caseTitle={assignment.case_title}
        onClose={() => setReassignOpen(false)}
        onSuccess={() => {
          setReassignOpen(false);
          qc.invalidateQueries(['contractor-assignment', selectedId]);
        }}
      />
    </Box>
  );
}
