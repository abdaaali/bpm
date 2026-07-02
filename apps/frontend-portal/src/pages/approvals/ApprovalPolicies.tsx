import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  IconButton, Select, MenuItem, FormControl, InputLabel, Checkbox,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { approvalApi } from '../../api/client';

const STEP_TYPES = [
  { value: 'hierarchy',        label: 'Hierarchy (Manager Chain)' },
  { value: 'role',             label: 'By Role' },
  { value: 'specific_user',   label: 'Specific User' },
  { value: 'org_unit_manager', label: 'Org Unit Manager' },
];

function blankStep() {
  return {
    id: `step_${Date.now()}`, label: '', type: 'hierarchy',
    hierarchyLevel: 1, roleKey: '', userId: '', orgUnitId: '',
    slaHours: 24, parallel: false,
  };
}

function StepEditor({ steps, onChange }: { steps: any[]; onChange: (s: any[]) => void }) {
  const add    = () => onChange([...steps, blankStep()]);
  const remove = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const upd    = (i: number, field: string, val: any) =>
    onChange(steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return (
    <Box>
      {steps.map((step, i) => (
        <Card key={step.id || i} variant="outlined" sx={{ mb: 2, p: 2 }}>
          <Box display="flex" gap={2} alignItems="flex-start" flexWrap="wrap">
            <Box flex="1" minWidth={140}>
              <TextField fullWidth size="small" label="Step Label" value={step.label || ''}
                onChange={e => upd(i, 'label', e.target.value)} placeholder={`Step ${i + 1}`} />
            </Box>
            <Box minWidth={200}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select label="Type" value={step.type} onChange={e => upd(i, 'type', e.target.value)}>
                  {STEP_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            {step.type === 'hierarchy' && (
              <Box width={100}>
                <TextField fullWidth size="small" label="Level" type="number"
                  value={step.hierarchyLevel ?? 1}
                  onChange={e => upd(i, 'hierarchyLevel', parseInt(e.target.value, 10) || 1)}
                  inputProps={{ min: 1, max: 5 }} />
              </Box>
            )}
            {step.type === 'role' && (
              <Box flex="1" minWidth={140}>
                <TextField fullWidth size="small" label="Role Key" value={step.roleKey || ''}
                  onChange={e => upd(i, 'roleKey', e.target.value)} placeholder="e.g. manager" />
              </Box>
            )}
            {step.type === 'specific_user' && (
              <Box flex="1" minWidth={220}>
                <TextField fullWidth size="small" label="User ID (UUID)" value={step.userId || ''}
                  onChange={e => upd(i, 'userId', e.target.value)} />
              </Box>
            )}
            {step.type === 'org_unit_manager' && (
              <Box flex="1" minWidth={220}>
                <TextField fullWidth size="small" label="Org Unit ID (UUID)" value={step.orgUnitId || ''}
                  onChange={e => upd(i, 'orgUnitId', e.target.value)} />
              </Box>
            )}
            <Box width={100}>
              <TextField fullWidth size="small" label="SLA (hrs)" type="number"
                value={step.slaHours ?? 24}
                onChange={e => upd(i, 'slaHours', parseInt(e.target.value, 10) || 24)}
                inputProps={{ min: 1 }} />
            </Box>
            <FormControlLabel
              control={<Checkbox size="small" checked={!!step.parallel}
                onChange={e => upd(i, 'parallel', e.target.checked)} />}
              label="Parallel" sx={{ mt: 0.5 }} />
            <IconButton size="small" color="error" onClick={() => remove(i)} sx={{ mt: 0.5 }}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Card>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined">Add Step</Button>
    </Box>
  );
}

export default function ApprovalPolicies() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [createSteps, setCreateSteps] = useState<any[]>([]);
  const [editSteps, setEditSteps] = useState<any[]>([]);
  const [error, setError] = useState('');

  const { data } = useQuery('approval-policies', () => approvalApi.listPolicies(1, 50));

  const create = useMutation(
    () => approvalApi.createPolicy({ name, description: desc, steps: createSteps }),
    {
      onSuccess: () => {
        qc.invalidateQueries('approval-policies');
        setCreating(false); setName(''); setDesc(''); setCreateSteps([]);
      },
      onError: (e: any) => setError(e.response?.data?.message || e.message),
    },
  );

  const update = useMutation(
    () => approvalApi.updatePolicy(editing.id, { steps: editSteps }),
    {
      onSuccess: () => { qc.invalidateQueries('approval-policies'); setEditing(null); setEditSteps([]); },
      onError: (e: any) => setError(e.response?.data?.message || e.message),
    },
  );

  const openEdit = (p: any) => {
    setEditing(p);
    setEditSteps(JSON.parse(JSON.stringify(p.steps || [])));
    setError('');
  };

  const openCreate = () => {
    setCreating(true); setName(''); setDesc(''); setCreateSteps([]); setError('');
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Approval Policies</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Policy</Button>
      </Box>

      <Grid container spacing={3}>
        {data?.data?.map((p: any) => (
          <Grid item xs={12} sm={6} md={4} key={p.id}>
            <Card>
              <CardContent>
                <Typography variant="h6">{p.name}</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                  {p.description || 'No description'}
                </Typography>
                <Box mt={2} display="flex" gap={1} flexWrap="wrap">
                  <Chip
                    label={`${p.steps?.length || 0} step${p.steps?.length === 1 ? '' : 's'}`}
                    size="small" />
                  <Chip
                    label={p.active !== false ? 'active' : 'inactive'}
                    size="small"
                    color={p.active !== false ? 'success' : 'default'} />
                </Box>
              </CardContent>
              <CardActions>
                <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(p)}>
                  Edit Steps
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
        {!data?.data?.length && (
          <Grid item xs={12}>
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No approval policies yet. Create your first one!</Typography>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* ── Create Dialog ── */}
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="md" fullWidth>
        <DialogTitle>New Approval Policy</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box display="flex" gap={2}>
            <TextField required fullWidth size="small" label="Policy Name"
              value={name} onChange={e => setName(e.target.value)} />
            <TextField fullWidth size="small" label="Description"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </Box>
          <Typography variant="subtitle2" mt={1}>Approval Steps</Typography>
          <StepEditor steps={createSteps} onChange={setCreateSteps} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name || create.isLoading}
            onClick={() => create.mutate()}>
            Create Policy
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Steps Dialog ── */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Steps — {editing?.name}</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {editing?.description && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              {editing.description}
            </Typography>
          )}
          <StepEditor steps={editSteps} onChange={setEditSteps} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={update.isLoading}
            onClick={() => update.mutate()}>
            Save Steps
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
