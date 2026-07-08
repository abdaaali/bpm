import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Chip, Button, Tabs, Tab, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress,
  Alert, Divider, List, ListItem, ListItemText, IconButton,
  LinearProgress, Tooltip, Paper,
} from '@mui/material';
import {
  ArrowBack, CheckCircle, Cancel, Send, Upload, Chat,
  AttachFile, PictureAsPdf, Image, Info, Warning,
} from '@mui/icons-material';
import { format, formatDistanceToNow } from 'date-fns';
import { workOrderApi, attachmentApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#f9a825', low: '#388e3c',
};

const STATUS_CONFIG: Record<string, { color: any; label: string }> = {
  pending: { color: 'warning', label: 'Awaiting Acceptance' },
  accepted: { color: 'info', label: 'Accepted' },
  in_progress: { color: 'primary', label: 'In Progress' },
  submitted: { color: 'secondary', label: 'Pending Operator Review' },
  rework_required: { color: 'error', label: 'Rework Required' },
  closed: { color: 'success', label: 'Completed & Closed' },
  rejected: { color: 'default', label: 'Rejected' },
};

const SUB_TYPE_LABELS: Record<string, string> = {
  acceptance: '✅ Accepted', rejection: '❌ Rejected', progress_update: '📋 Progress Update',
  completion: '🏁 Completion Submitted', rework_submission: '🔄 Rework Submitted',
  clarification_request: '❓ Clarification Request', reschedule_request: '📅 Reschedule Request',
};

function TabPanel({ children, value, index }: any) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Dialog states
  const [rejectOpen, setRejectOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Form states
  const [rejectReason, setRejectReason] = useState('');
  const [progressNotes, setProgressNotes] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [completePayload, setCompletePayload] = useState<any>({});
  const [clarificationMsg, setClarificationMsg] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [chatMsg, setChatMsg] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);

  const load = () => {
    setLoading(true);
    workOrderApi.get(id!)
      .then(r => { setWo(r.data); setLoading(false); })
      .catch(e => { setError(e.message || 'Failed to load work order'); setLoading(false); });
  };

  useEffect(() => { load(); }, [id]);

  const action = async (fn: () => Promise<any>) => {
    setActionLoading(true); setActionError('');
    try { await fn(); load(); }
    catch (e: any) { setActionError(e.response?.data?.message || e.message); }
    finally { setActionLoading(false); }
  };

  const handleAccept = () => action(async () => { await workOrderApi.accept(id!); });
  const handleReject = () => action(async () => { await workOrderApi.reject(id!, rejectReason); setRejectOpen(false); });
  const handleProgress = () => action(async () => { await workOrderApi.submitProgress(id!, { notes: progressNotes }); setProgressOpen(false); });
  const handleComplete = () => action(async () => { await workOrderApi.complete(id!, { notes: completeNotes, payload: completePayload }); setCompleteOpen(false); });
  const handleClarification = () => action(async () => { await workOrderApi.requestClarification(id!, clarificationMsg); setClarificationOpen(false); });
  const handleReschedule = () => action(async () => { await workOrderApi.requestReschedule(id!, { requestedDate: rescheduleDate, reason: rescheduleReason }); setRescheduleOpen(false); });
  const handleChatSend = () => { if (!chatMsg.trim()) return; action(async () => { await workOrderApi.requestClarification(id!, chatMsg); setChatMsg(''); }); };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      // Backend allows photo|document|report|signature|other (013_external_contractor.sql);
      // infer from the actual file instead of hardcoding 'photo' for every upload,
      // which mislabeled PDFs/docs (wrong icon + wrong Chip text in the list below).
      const attachmentType = file.type.startsWith('image/') ? 'photo' : 'document';
      await attachmentApi.upload(id!, fd, attachmentType);
      load();
    } catch (err: any) { setActionError(err.message); }
    finally { setUploadLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  if (loading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!wo) return null;

  const status = STATUS_CONFIG[wo.assignment_status] || { color: 'default', label: wo.assignment_status };
  const isOverdue = wo.due_at && new Date(wo.due_at) < new Date() && !['closed', 'rejected'].includes(wo.assignment_status);
  const canAct = !['closed', 'rejected'].includes(wo.assignment_status);
  const slaPercent = wo.sla_hours && wo.assigned_at
    ? Math.min(100, Math.round(((Date.now() - new Date(wo.assigned_at).getTime()) / (wo.sla_hours * 3600000)) * 100))
    : 0;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <IconButton onClick={() => navigate('/work-orders')}><ArrowBack /></IconButton>
        <Typography variant="h5" fontWeight="bold" flexGrow={1}>{wo.case_number} — {wo.title}</Typography>
        <Chip label={status.label} color={status.color} />
        {isOverdue && <Chip label="OVERDUE" color="error" icon={<Warning />} />}
      </Box>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      {/* Action buttons */}
      {canAct && (
        <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
              <Typography variant="body2" fontWeight="bold" mr={1}>Actions:</Typography>
              {wo.assignment_status === 'pending' && <>
                <Button variant="contained" color="success" size="small" startIcon={<CheckCircle />} onClick={handleAccept} disabled={actionLoading}>Accept</Button>
                <Button variant="outlined" color="error" size="small" startIcon={<Cancel />} onClick={() => setRejectOpen(true)} disabled={actionLoading}>Reject</Button>
              </>}
              {['accepted', 'in_progress'].includes(wo.assignment_status) && <>
                <Button variant="contained" size="small" onClick={() => setProgressOpen(true)} disabled={actionLoading}>Update Progress</Button>
                <Button variant="contained" color="success" size="small" onClick={() => setCompleteOpen(true)} disabled={actionLoading}>Submit Completion</Button>
                <Button variant="outlined" size="small" onClick={() => setClarificationOpen(true)} disabled={actionLoading}>Request Clarification</Button>
                <Button variant="outlined" size="small" onClick={() => setRescheduleOpen(true)} disabled={actionLoading}>Request Reschedule</Button>
              </>}
              {wo.assignment_status === 'rework_required' && <>
                <Button variant="contained" color="warning" size="small" onClick={() => setCompleteOpen(true)} disabled={actionLoading}>Submit Rework</Button>
                <Button variant="outlined" size="small" onClick={() => setClarificationOpen(true)} disabled={actionLoading}>Request Clarification</Button>
              </>}
              {actionLoading && <CircularProgress size={20} />}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Chip label={wo.priority} size="small" sx={{ display: 'block', mt: 0.5, bgcolor: PRIORITY_COLORS[wo.priority] + '20', color: PRIORITY_COLORS[wo.priority], fontWeight: 700, textTransform: 'capitalize' }} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Type</Typography>
                  <Typography variant="body2" fontWeight="medium" textTransform="capitalize">{wo.case_type?.replace('_', ' ')}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Site</Typography>
                  <Typography variant="body2">{wo.site_name || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Location</Typography>
                  <Typography variant="body2">{wo.location || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Assigned</Typography>
                  <Typography variant="body2">{wo.assigned_at ? format(new Date(wo.assigned_at), 'MMM d, yyyy') : '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Due Date</Typography>
                  <Typography variant="body2" color={isOverdue ? 'error' : 'inherit'} fontWeight={isOverdue ? 700 : 400}>
                    {wo.due_at ? format(new Date(wo.due_at), 'MMM d, yyyy HH:mm') : '—'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Assigned To</Typography>
                  <Typography variant="body2">{wo.assigned_user_name || wo.company_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Dispatched By</Typography>
                  <Typography variant="body2">{wo.dispatched_by_name || 'Operator'}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>SLA Progress</Typography>
              <LinearProgress variant="determinate" value={slaPercent} color={slaPercent > 80 ? 'error' : slaPercent > 60 ? 'warning' : 'primary'} sx={{ mb: 1, height: 8, borderRadius: 4 }} />
              <Typography variant="caption" color="text.secondary">{slaPercent}% of {wo.sla_hours}h SLA used</Typography>
              {wo.rework_count > 0 && (
                <Box mt={1}><Chip label={`Rework count: ${wo.rework_count}`} size="small" color="warning" /></Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Work Order Details" />
          <Tab label={`History (${wo.submissions?.length || 0})`} />
          <Tab label={`Attachments (${wo.attachments?.length || 0})`} />
          <Tab label={`Communication (${wo.comments?.length || 0})`} />
        </Tabs>
        <CardContent>
          {/* Tab 0: Details */}
          <TabPanel value={tab} index={0}>
            <Typography variant="subtitle2" gutterBottom>Description</Typography>
            <Typography variant="body2" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>{wo.description || 'No description provided.'}</Typography>
            {wo.instructions && <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>Instructions from Operator</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'info.50' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{wo.instructions}</Typography>
              </Paper>
            </>}
          </TabPanel>

          {/* Tab 1: Submission History */}
          <TabPanel value={tab} index={1}>
            {(wo.submissions || []).length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={2}>No submissions yet</Typography>
            ) : (
              <List dense>
                {wo.submissions.map((s: any, i: number) => (
                  <React.Fragment key={s.id}>
                    <ListItem alignItems="flex-start" sx={{ pl: 0 }}>
                      <ListItemText
                        primary={<Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" fontWeight="bold">{SUB_TYPE_LABELS[s.submission_type] || s.submission_type}</Typography>
                          <Typography variant="caption" color="text.secondary">{format(new Date(s.submitted_at), 'MMM d, HH:mm')}</Typography>
                        </Box>}
                        secondary={<>
                          {s.submitter_name && <Typography variant="caption" display="block" color="text.secondary">by {s.submitter_name}</Typography>}
                          {s.notes && <Typography variant="body2" sx={{ mt: 0.5 }}>{s.notes}</Typography>}
                          {s.payload && Object.keys(s.payload).length > 0 && (
                            <Box mt={0.5}>{Object.entries(s.payload).map(([k, v]) => (
                              <Typography key={k} variant="caption" display="block" color="text.secondary">{k}: {String(v)}</Typography>
                            ))}</Box>
                          )}
                        </>}
                      />
                    </ListItem>
                    {i < wo.submissions.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </TabPanel>

          {/* Tab 2: Attachments */}
          <TabPanel value={tab} index={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle2">Uploaded Files</Typography>
              {canAct && (
                <>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx" />
                  <Button startIcon={<Upload />} variant="outlined" size="small" onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}>
                    {uploadLoading ? <CircularProgress size={16} /> : 'Upload File'}
                  </Button>
                </>
              )}
            </Box>
            {(wo.attachments || []).length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={2}>No attachments yet</Typography>
            ) : (
              <Grid container spacing={1.5}>
                {wo.attachments.map((att: any) => (
                  <Grid item xs={6} sm={4} md={3} key={att.id}>
                    <Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                      {att.attachment_type === 'photo' ? <Image color="primary" sx={{ fontSize: 36 }} /> : <AttachFile color="action" sx={{ fontSize: 36 }} />}
                      <Typography variant="caption" display="block" noWrap title={att.file_name}>{att.file_name}</Typography>
                      <Chip label={att.attachment_type} size="small" sx={{ mt: 0.5, fontSize: 10 }} />
                      <Box mt={1}><Button size="small" href={attachmentApi.getDownloadUrl(att.id)} target="_blank">Download</Button></Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </TabPanel>

          {/* Tab 3: Communication */}
          <TabPanel value={tab} index={3}>
            <Box sx={{ maxHeight: 350, overflowY: 'auto', mb: 2 }}>
              {(wo.comments || []).length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={2}>No messages yet</Typography>
              ) : (wo.comments || []).map((c: any) => (
                <Box key={c.id} sx={{ mb: 2, display: 'flex', flexDirection: c.author_name ? 'row' : 'row-reverse', gap: 1 }}>
                  <Box sx={{ maxWidth: '80%', bgcolor: c.author_name ? 'grey.100' : 'primary.50', borderRadius: 2, p: 1.5 }}>
                    {c.author_name && <Typography variant="caption" fontWeight="bold" color="text.secondary" display="block">{c.author_name} (Operator)</Typography>}
                    <Typography variant="body2">{c.body}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            {canAct && (
              <Box display="flex" gap={1}>
                <TextField size="small" fullWidth placeholder="Send a message to the operator..." value={chatMsg}
                  onChange={e => setChatMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  multiline maxRows={3} />
                <Button variant="contained" onClick={handleChatSend} disabled={!chatMsg.trim() || actionLoading}><Send /></Button>
              </Box>
            )}
          </TabPanel>
        </CardContent>
      </Card>

      {/* Action Dialogs */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Work Order</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Please provide a reason for rejection. This will be visible to the operator.</Alert>
          <TextField label="Reason for Rejection" multiline rows={3} fullWidth value={rejectReason} onChange={e => setRejectReason(e.target.value)} required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleReject} disabled={!rejectReason || actionLoading}>Reject</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={progressOpen} onClose={() => setProgressOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Submit Progress Update</DialogTitle>
        <DialogContent>
          <TextField label="Progress Notes" multiline rows={4} fullWidth sx={{ mt: 1 }} value={progressNotes} onChange={e => setProgressNotes(e.target.value)} placeholder="Describe what work has been done so far..." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleProgress} disabled={!progressNotes || actionLoading}>Submit Update</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={completeOpen} onClose={() => setCompleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{wo.assignment_status === 'rework_required' ? 'Submit Rework' : 'Submit Completion'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>After submission, the operator will review your work and either approve or request rework.</Alert>
          <TextField label="Completion Notes" multiline rows={4} fullWidth sx={{ mb: 2 }} value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} placeholder="Describe the work completed, materials used, findings..." required />
          <TextField label="Serial Numbers / Equipment IDs (optional)" fullWidth value={completePayload.serial_numbers || ''} onChange={e => setCompletePayload((p: any) => ({ ...p, serial_numbers: e.target.value }))} placeholder="e.g., RRU-SN-12345 replaced with RRU-SN-67890" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteOpen(false)}>Cancel</Button>
          <Button color="success" variant="contained" onClick={handleComplete} disabled={!completeNotes || actionLoading}>Submit</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={clarificationOpen} onClose={() => setClarificationOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Clarification</DialogTitle>
        <DialogContent>
          <TextField label="Your Question / Request" multiline rows={3} fullWidth sx={{ mt: 1 }} value={clarificationMsg} onChange={e => setClarificationMsg(e.target.value)} placeholder="What do you need clarification on?" required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClarificationOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleClarification} disabled={!clarificationMsg || actionLoading}>Send Request</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Reschedule</DialogTitle>
        <DialogContent>
          <TextField label="Requested New Date" type="datetime-local" fullWidth sx={{ mb: 2, mt: 1 }} value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
          <TextField label="Reason for Reschedule" multiline rows={2} fullWidth value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduleOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleReason || actionLoading}>Submit Request</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
