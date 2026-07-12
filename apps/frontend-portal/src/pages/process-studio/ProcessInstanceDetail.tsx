import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Button, Chip, CircularProgress, Alert, Paper, Tabs, Tab,
  Table, TableHead, TableBody, TableRow, TableCell, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip, Divider, Card, CardContent,
  Accordion, AccordionSummary, AccordionDetails, Avatar, Stack, Grid,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import CommentIcon from '@mui/icons-material/Comment';
import { processApi, orgApi } from '../../api/client';
import { getFormSchema, optionLabel, FieldDef } from './startFormHelpers';
import PageHeader from '../../components/PageHeader';
import { format } from 'date-fns';
import { useAuth } from '../../auth/AuthContext';

const STATUS_COLORS: Record<string, any> = {
  active: 'primary', completed: 'success', suspended: 'warning', terminated: 'error',
};

const TASK_STATUS_COLORS: Record<string, any> = {
  pending: 'default', in_progress: 'primary', completed: 'success', cancelled: 'default', escalated: 'error',
};

// Inject BPMN highlight CSS once into document head
function ensureBpmnHighlightStyles() {
  if (document.getElementById('bpmn-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'bpmn-highlight-styles';
  style.textContent = `
    .bpmn-token-current .djs-visual > :nth-child(1) {
      fill: rgba(25, 118, 210, 0.18) !important;
      stroke: #1976d2 !important;
      stroke-width: 3px !important;
    }
    .bpmn-token-done .djs-visual > :nth-child(1) {
      fill: rgba(46, 125, 50, 0.12) !important;
      stroke: #388e3c !important;
      stroke-width: 2px !important;
    }
    .bpmn-token-active .djs-visual > :nth-child(1) {
      fill: rgba(245, 124, 0, 0.15) !important;
      stroke: #e65100 !important;
      stroke-width: 2px !important;
    }
  `;
  document.head.appendChild(style);
}

interface EditingVar { key: string; value: string; isNew: boolean; }

// Format a captured form-field value for display (resolve select ids → labels,
// render checkboxes as Yes/No).
function displayValue(field: FieldDef, raw: any): string {
  if (raw == null || raw === '') return '—';
  if (field.type === 'checkbox') return (raw === true || raw === 'true') ? 'Yes' : 'No';
  if (field.type === 'select') return optionLabel(field.options, raw);
  return String(raw);
}

// One expandable card summarizing a single phase (task) of the process: who
// handled it, when, the outcome, the data they captured, and their comments.
function PhaseCard({ task: t, userName, initials }: {
  task: any;
  userName: (uid?: string | null) => string;
  initials: (name: string) => string;
}) {
  const schema = getFormSchema(t.variables) as FieldDef[];
  const captured = schema.filter(f => !f.key.startsWith('_'));
  const comments: any[] = Array.isArray(t.comments) ? t.comments : [];
  const handler = userName(t.assignee_id);
  const done = t.status === 'completed';
  const ts = (v?: string) => (v ? format(new Date(v), 'dd MMM yyyy HH:mm') : '—');

  return (
    <Accordion defaultExpanded={['pending', 'in_progress'].includes(t.status)} disableGutters
      sx={{ mb: 1, border: '1px solid #e0e0e0', '&:before': { display: 'none' }, borderRadius: 1, overflow: 'hidden' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center" gap={1.5} sx={{ width: '100%', flexWrap: 'wrap' }}>
          <Avatar sx={{ width: 30, height: 30, bgcolor: done ? 'success.main' : t.status === 'in_progress' ? 'primary.main' : 'grey.400', fontSize: 13 }}>
            {handler ? initials(handler) : <PersonIcon fontSize="small" />}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 180 }}>
            <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{t.node_id}</Typography>
          </Box>
          <Chip label={t.status} size="small" color={TASK_STATUS_COLORS[t.status] || 'default'} />
          {t.outcome && <Chip label={t.outcome} size="small" variant="outlined" />}
          {t.sla_breached && <Chip label="SLA breached" size="small" color="error" />}
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 150, textAlign: 'right' }}>
            {handler ? <><strong>{handler}</strong>{done ? ` · ${ts(t.completed_at)}` : ''}</> : 'Unassigned'}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ bgcolor: '#fafafa' }}>
        {/* Phase metadata */}
        <Grid container spacing={1} sx={{ mb: 1 }}>
          {[
            ['Handler', handler || 'Unassigned'],
            ['Claimed', ts(t.claimed_at)],
            ['Completed', ts(t.completed_at)],
            ['Due', ts(t.due_at)],
          ].map(([label, val]) => (
            <Grid item xs={6} sm={3} key={label}>
              <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
              <Typography variant="body2">{val}</Typography>
            </Grid>
          ))}
        </Grid>
        <Divider sx={{ my: 1 }} />

        {/* Captured data */}
        <Typography variant="caption" color="text.secondary" fontWeight={600}>CAPTURED AT THIS PHASE</Typography>
        {captured.length ? (
          <Table size="small" sx={{ mt: 0.5, mb: 1 }}>
            <TableBody>
              {captured.map(f => (
                <TableRow key={f.key}>
                  <TableCell sx={{ border: 0, py: 0.4, width: '40%', color: 'text.secondary' }}>{f.label || f.key}</TableCell>
                  <TableCell sx={{ border: 0, py: 0.4, whiteSpace: 'pre-wrap' }}>
                    <Typography variant="body2">{displayValue(f, t.variables?.[f.key])}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
            This phase has no data form — completion captures the handler and outcome only.
          </Typography>
        )}

        {/* Comments */}
        <Divider sx={{ my: 1 }} />
        <Box display="flex" alignItems="center" gap={0.5}>
          <CommentIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            COMMENTS ({comments.length})
          </Typography>
        </Box>
        {comments.length ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {comments.map((c, i) => (
              <Box key={i} display="flex" gap={1}>
                <Avatar sx={{ width: 24, height: 24, fontSize: 11 }}>{initials(userName(c.userId))}</Avatar>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    <strong>{userName(c.userId)}</strong> · {ts(c.createdAt)}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.message}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>No comments.</Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function ProcessInstanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [tab, setTab] = useState(0);
  const [terminateDialog, setTerminateDialog] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [editingVar, setEditingVar] = useState<EditingVar | null>(null);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarVal, setNewVarVal] = useState('');
  const [addingVar, setAddingVar] = useState(false);
  const [snack, setSnack] = useState('');

  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [viewerMsg, setViewerMsg] = useState('');

  const { data: inst, isLoading, error } = useQuery(
    ['instance', id],
    () => processApi.getInstance(id!),
    { refetchInterval: (data) => data?.status === 'active' ? 10000 : false },
  );

  const { data: tasksData } = useQuery(
    ['instance-tasks', id],
    () => processApi.listTasks({ instanceId: id }, 1, 100),
    { enabled: !!id },
  );

  // Resolve assignee/comment-author UUIDs → display names
  const { data: usersData } = useQuery('org-users-lite', () => orgApi.getUsers(1, 500));
  const userName = (uid?: string | null): string => {
    if (!uid) return '';
    // assignee_id / comment.userId hold the Keycloak sub (the gateway forwards
    // req.user.sub), so match on keycloak_id first, then internal id as fallback.
    const u = (usersData?.data || []).find((x: any) => x.keycloak_id === uid || x.id === uid);
    if (!u) return uid.slice(0, 8) + '…';
    return u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.email || uid.slice(0, 8) + '…';
  };
  const initials = (name: string) =>
    name.split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  const suspend = useMutation(() => processApi.suspendInstance(id!), {
    onSuccess: () => { qc.invalidateQueries(['instance', id]); setSnack('Instance suspended'); },
    onError: (e: any) => setSnack(e.response?.data?.message || e.message),
  });

  const resume = useMutation(() => processApi.resumeInstance(id!), {
    onSuccess: () => { qc.invalidateQueries(['instance', id]); setSnack('Instance resumed'); },
    onError: (e: any) => setSnack(e.response?.data?.message || e.message),
  });

  const terminate = useMutation((reason: string) => processApi.terminateInstance(id!, reason), {
    onSuccess: () => {
      qc.invalidateQueries(['instance', id]);
      setTerminateDialog(false);
      setTerminateReason('');
      setSnack('Instance terminated');
    },
    onError: (e: any) => setSnack(e.response?.data?.message || e.message),
  });

  const updateVars = useMutation((vars: any) => processApi.updateInstanceVariables(id!, vars), {
    onSuccess: () => {
      qc.invalidateQueries(['instance', id]);
      setEditingVar(null);
      setAddingVar(false);
      setNewVarKey('');
      setNewVarVal('');
    },
    onError: (e: any) => setSnack(e.response?.data?.message || e.message),
  });

  // Build BPMN viewer when diagram tab is active + instance data is ready
  useEffect(() => {
    if (tab !== 0 || !inst?.bpmn_xml || !viewerContainerRef.current) return;
    let cancelled = false;
    ensureBpmnHighlightStyles();

    import('bpmn-js/lib/NavigatedViewer').then(({ default: NavigatedViewer }) => {
      if (cancelled || !viewerContainerRef.current) return;

      // Destroy previous viewer
      viewerRef.current?.destroy();

      const viewer = new NavigatedViewer({ container: viewerContainerRef.current });
      viewerRef.current = viewer;

      if (!inst.bpmn_xml?.includes('BPMNDiagram')) {
        // Process has semantic XML but no visual layout yet — open in Studio to set it up
        setViewerMsg('No diagram layout saved yet. Open the process in Process Studio, then save to generate the visual layout.');
        return;
      }

      viewer.importXML(inst.bpmn_xml).then(() => {
        if (cancelled) return;
        setViewerMsg('');
        const canvas = viewer.get('canvas') as any;
        canvas.zoom('fit-viewport', 'auto');

        const tasks: any[] = tasksData?.data || [];

        // Mark completed task nodes green
        tasks.filter(t => t.status === 'completed').forEach(t => {
          try { canvas.addMarker(t.node_id, 'bpmn-token-done'); } catch { /* node may not exist */ }
        });

        // Mark active/in-progress task nodes orange
        tasks.filter(t => ['pending', 'in_progress'].includes(t.status)).forEach(t => {
          try { canvas.addMarker(t.node_id, 'bpmn-token-active'); } catch {}
        });

        // Mark current process node blue (where token is waiting)
        if (inst.current_node_id && inst.status === 'active') {
          try { canvas.addMarker(inst.current_node_id, 'bpmn-token-current'); } catch {}
        }
      }).catch((e: any) => {
        setViewerMsg(`Diagram could not be loaded: ${e.message}`);
      });
    });

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // Rebuild when tab opens, instance changes, or tasks change
  }, [tab, inst?.id, inst?.bpmn_xml, inst?.current_node_id, tasksData?.data?.length]);

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (error || !inst) return <Alert severity="error">Instance not found</Alert>;

  const isActive = inst.status === 'active';
  const isSuspended = inst.status === 'suspended';
  const canControl = isActive || isSuspended;

  // Filter out internal variables (prefixed with _) for display
  const variables = Object.entries((inst.variables as Record<string, any>) || {})
    .filter(([k]) => !k.startsWith('_'));

  const saveVar = (key: string, rawVal: string) => {
    let parsed: any = rawVal;
    try { parsed = JSON.parse(rawVal); } catch { /* keep as string */ }
    updateVars.mutate({ [key]: parsed });
  };

  const addVar = () => {
    if (!newVarKey.trim()) return;
    let parsed: any = newVarVal;
    try { parsed = JSON.parse(newVarVal); } catch { /* keep as string */ }
    updateVars.mutate({ [newVarKey.trim()]: parsed });
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, flexShrink: 0 }}>
        <PageHeader
          backTo="/processes/instances"
          backLabel="Back to Process Monitor"
          title={inst.definition_name}
          chips={<>
            <Chip label={`v${inst.version || 1}`} size="small" />
            <Chip label={inst.status} size="small" color={STATUS_COLORS[inst.status] || 'default'} />
          </>}
          actions={<>
            {isSuspended && (
              <Button size="small" variant="outlined" color="primary" startIcon={<PlayArrowIcon />}
                onClick={() => resume.mutate()} disabled={resume.isLoading}>
                Resume
              </Button>
            )}
            {isActive && (
              <Button size="small" variant="outlined" color="warning" startIcon={<PauseIcon />}
                onClick={() => suspend.mutate()} disabled={suspend.isLoading}>
                Suspend
              </Button>
            )}
            {canControl && (
              <Button size="small" variant="outlined" color="error" startIcon={<StopIcon />}
                onClick={() => setTerminateDialog(true)}>
                Terminate
              </Button>
            )}
          </>}
        />

        <Box display="flex" gap={3} mt={1} flexWrap="wrap">
          {inst.business_key && (
            <Typography variant="caption" color="text.secondary">
              Key: <strong>{inst.business_key}</strong>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Started: <strong>{format(new Date(inst.started_at), 'dd MMM yyyy HH:mm')}</strong>
          </Typography>
          {inst.completed_at && (
            <Typography variant="caption" color="text.secondary">
              Ended: <strong>{format(new Date(inst.completed_at), 'dd MMM yyyy HH:mm')}</strong>
            </Typography>
          )}
          {inst.current_node_id && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              Node: <strong>{inst.current_node_id}</strong>
            </Typography>
          )}
        </Box>
      </Paper>

      {snack && <Alert severity="info" sx={{ mb: 1, flexShrink: 0 }} onClose={() => setSnack('')}>{snack}</Alert>}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ flexShrink: 0, borderBottom: '1px solid #e0e0e0', mb: 0 }}>
        <Tab label="Diagram" />
        <Tab label={`Journey (${tasksData?.total || 0})`} />
        <Tab label={`Variables (${variables.length})`} />
      </Tabs>

      {/* Diagram tab */}
      {tab === 0 && (
        <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 400, mt: 1 }}>
          <Box
            ref={viewerContainerRef}
            sx={{
              width: '100%',
              height: '100%',
              minHeight: 480,
              border: '1px solid #e0e0e0',
              borderRadius: 2,
              bgcolor: '#fafafa',
              '& .bjs-container': { height: '100%' },
            }}
          />
          {viewerMsg && (
          <Alert severity="info" sx={{ mb: 1 }}>{viewerMsg}</Alert>
        )}
          {/* Legend */}
          <Box sx={{
            position: 'absolute', bottom: 12, right: 12, bgcolor: 'white',
            border: '1px solid #e0e0e0', borderRadius: 1, p: 1, display: 'flex', gap: 2,
          }}>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1976d2' }} />
              <Typography variant="caption">Current</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#e65100' }} />
              <Typography variant="caption">Active task</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#388e3c' }} />
              <Typography variant="caption">Completed</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Journey tab — one expandable card per phase, in chronological order */}
      {tab === 1 && (
        <Box sx={{ flexGrow: 1, mt: 1, overflowY: 'auto' }}>
          {[...(tasksData?.data || [])]
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((t: any) => <PhaseCard key={t.id} task={t} userName={userName} initials={initials} />)}
          {!tasksData?.data?.length && (
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <Typography color="text.secondary">No phases recorded yet for this instance.</Typography>
            </Card>
          )}
        </Box>
      )}

      {/* Variables tab */}
      {tab === 2 && (
        <Box sx={{ flexGrow: 1, mt: 1 }}>
          <Card>
            <CardContent sx={{ p: 0 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Key</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell>Type</TableCell>
                    {isActive && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {variables.map(([key, val]) => (
                    <TableRow key={key} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{key}</TableCell>
                      <TableCell>
                        {editingVar?.key === key ? (
                          <TextField
                            size="small" value={editingVar.value}
                            onChange={e => setEditingVar(v => v ? { ...v, value: e.target.value } : null)}
                            autoFocus
                          />
                        ) : (
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{typeof val}</Typography>
                      </TableCell>
                      {isActive && (
                        <TableCell align="right">
                          {editingVar?.key === key ? (
                            <>
                              <Tooltip title="Save">
                                <IconButton size="small" onClick={() => saveVar(key, editingVar.value)}>
                                  <CheckIcon fontSize="small" color="success" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton size="small" onClick={() => setEditingVar(null)}>
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          ) : (
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => setEditingVar({
                                key, value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''), isNew: false,
                              })}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}

                  {/* Add new variable row */}
                  {isActive && addingVar && (
                    <TableRow>
                      <TableCell>
                        <TextField size="small" placeholder="key" value={newVarKey}
                          onChange={e => setNewVarKey(e.target.value)} autoFocus />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" placeholder="value (JSON or string)" value={newVarVal}
                          onChange={e => setNewVarVal(e.target.value)} />
                      </TableCell>
                      <TableCell />
                      <TableCell align="right">
                        <Tooltip title="Save">
                          <IconButton size="small" onClick={addVar} disabled={!newVarKey.trim()}>
                            <CheckIcon fontSize="small" color="success" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <IconButton size="small" onClick={() => { setAddingVar(false); setNewVarKey(''); setNewVarVal(''); }}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )}

                  {!variables.length && !addingVar && (
                    <TableRow>
                      <TableCell colSpan={isActive ? 4 : 3} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No variables</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {isActive && !addingVar && (
                <Box p={1.5}>
                  <Button size="small" onClick={() => setAddingVar(true)}>+ Add Variable</Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Terminate Dialog */}
      <Dialog open={terminateDialog} onClose={() => setTerminateDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Terminate Instance</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will cancel all open tasks and end the process permanently.
          </Alert>
          <TextField
            fullWidth label="Reason" value={terminateReason}
            onChange={e => setTerminateReason(e.target.value)}
            placeholder="Why is this being terminated?"
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminateDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error"
            disabled={terminate.isLoading}
            onClick={() => terminate.mutate(terminateReason || 'Terminated by user')}>
            Terminate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
