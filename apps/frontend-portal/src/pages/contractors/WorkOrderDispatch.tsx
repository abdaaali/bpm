import React, { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel, Autocomplete, Checkbox,
  FormControlLabel, FormGroup, Alert, CircularProgress, Chip, Paper, Divider,
  Grid,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useQuery, useMutation } from 'react-query';
import { contractorApi } from '../../api/client';
import { ExternalCompany } from './ExternalCompanyRegistry';
import { ExternalUser } from './ExternalUserManager';
import BackButton from '../../components/BackButton';

interface WorkOrderDispatchProps {
  caseId?: string;
  caseTitle?: string;
  open?: boolean;
  onClose?: () => void;
  onSuccess?: (workOrderRef: string) => void;
  /** Render as standalone page (not dialog) */
  standalone?: boolean;
}

interface DispatchForm {
  case_id: string;
  company_id: string;
  user_id: string;
  assignment_type: 'company' | 'supervisor' | 'technician';
  due_at: string;
  sla_hours: number;
  instructions: string;
  allowed_forms: string[];
  visibility_rules: string[];
}

const FORM_OPTIONS = [
  { key: 'attachments', label: 'Attachments' },
  { key: 'site_photos', label: 'Site Photos' },
  { key: 'completion_report', label: 'Completion Report' },
  { key: 'test_results', label: 'Test Results' },
  { key: 'handover_form', label: 'Handover Form' },
];

const VISIBILITY_OPTIONS = [
  { key: 'case_description', label: 'Case Description' },
  { key: 'site_details', label: 'Site Details / CI Info' },
  { key: 'sla_deadline', label: 'SLA Deadline' },
  { key: 'contact_info', label: 'Internal Contact Info' },
  { key: 'history', label: 'Work Order History' },
];

const defaultDue = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 16);
};

export default function WorkOrderDispatch({
  caseId = '',
  caseTitle = '',
  open = true,
  onClose,
  onSuccess,
  standalone = false,
}: WorkOrderDispatchProps) {
  const [form, setForm] = useState<DispatchForm>({
    case_id: caseId,
    company_id: '',
    user_id: '',
    assignment_type: 'company',
    due_at: defaultDue(),
    sla_hours: 24,
    instructions: '',
    allowed_forms: ['attachments', 'completion_report'],
    visibility_rules: ['case_description', 'sla_deadline'],
  });
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');

  const { data: companies = [] } = useQuery<ExternalCompany[]>(
    'contractor-companies',
    () => contractorApi.getCompanies().then(r => r.data),
  );

  const { data: users = [] } = useQuery<ExternalUser[]>(
    ['contractor-users', form.company_id],
    () => contractorApi.getUsers(form.company_id ? { company_id: form.company_id } : undefined).then(r => r.data),
    { enabled: !!form.company_id },
  );

  const dispatchMutation = useMutation(
    (dto: DispatchForm) => contractorApi.dispatch(dto),
    {
      onSuccess: (res) => {
        const ref = res.data?.work_order_ref || res.data?.id || 'WO-CREATED';
        setSuccessRef(ref);
        if (onSuccess) onSuccess(ref);
      },
      onError: (e: any) => setError(e.response?.data?.message || 'Dispatch failed'),
    },
  );

  const toggleForm = (key: string) => {
    setForm(f => ({
      ...f,
      allowed_forms: f.allowed_forms.includes(key)
        ? f.allowed_forms.filter(x => x !== key)
        : [...f.allowed_forms, key],
    }));
  };

  const toggleVisibility = (key: string) => {
    setForm(f => ({
      ...f,
      visibility_rules: f.visibility_rules.includes(key)
        ? f.visibility_rules.filter(x => x !== key)
        : [...f.visibility_rules, key],
    }));
  };

  const handleSubmit = () => {
    if (!form.case_id?.trim()) { setError('Case ID is required'); return; }
    if (!form.company_id) { setError('Select an external company'); return; }
    setError('');
    dispatchMutation.mutate(form);
  };

  const content = (
    <Box>
      {successRef ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>Work Order Dispatched!</Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Work order reference:
          </Typography>
          <Chip label={successRef} color="success" sx={{ fontSize: 16, py: 1, px: 2, mt: 1 }} />
          <Box sx={{ mt: 3 }}>
            <Button variant="contained" onClick={() => { setSuccessRef(''); if (onClose) onClose(); }}>
              Done
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {!caseId && (
            <TextField
              label="Case ID"
              fullWidth
              required
              value={form.case_id}
              onChange={e => setForm(f => ({ ...f, case_id: e.target.value }))}
              helperText="Enter the case ID to dispatch"
            />
          )}
          {caseTitle && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
              <Typography variant="caption" color="text.secondary">Dispatching case:</Typography>
              <Typography variant="body2" fontWeight={600}>{caseTitle}</Typography>
            </Paper>
          )}

          <Autocomplete
            options={companies.filter(c => c.active)}
            getOptionLabel={c => c.company_name}
            filterOptions={(opts, { inputValue }) => {
              const q = inputValue.toLowerCase();
              return opts.filter(c =>
                c.company_name.toLowerCase().includes(q) ||
                c.company_type.toLowerCase().includes(q) ||
                (c.capabilities || []).some((cap: string) => cap.toLowerCase().includes(q))
              );
            }}
            value={companies.find(c => c.id === form.company_id) || null}
            onChange={(_, val) => setForm(f => ({ ...f, company_id: val?.id || '', user_id: '' }))}
            renderInput={params => (
              <TextField {...params} label="External Company" required placeholder="Search by name, type or capability…" />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{option.company_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.company_type} · {(option.capabilities || []).slice(0, 3).join(', ')}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText="No active companies found"
          />

          <FormControl fullWidth>
            <InputLabel>Assignment Type</InputLabel>
            <Select
              value={form.assignment_type}
              label="Assignment Type"
              onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value as DispatchForm['assignment_type'] }))}
            >
              <MenuItem value="company">Assign to Company (unallocated)</MenuItem>
              <MenuItem value="supervisor">Assign to Supervisor</MenuItem>
              <MenuItem value="technician">Assign to Specific Technician</MenuItem>
            </Select>
          </FormControl>

          {form.assignment_type !== 'company' && form.company_id && (
            <Autocomplete
              options={users.filter(u => {
                if (form.assignment_type === 'supervisor') return u.role === 'supervisor' || u.role === 'company_admin';
                return u.role === 'technician' || u.role === 'supervisor';
              })}
              getOptionLabel={u => `${u.full_name} (${u.role})`}
              value={users.find(u => u.id === form.user_id) || null}
              onChange={(_, val) => setForm(f => ({ ...f, user_id: val?.id || '' }))}
              renderInput={params => <TextField {...params} label="Select User (optional)" />}
            />
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Due Date"
                type="datetime-local"
                fullWidth
                value={form.due_at}
                onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="SLA Hours"
                type="number"
                fullWidth
                value={form.sla_hours}
                onChange={e => setForm(f => ({ ...f, sla_hours: parseInt(e.target.value) || 24 }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>

          <TextField
            label="Instructions"
            fullWidth
            multiline
            rows={4}
            value={form.instructions}
            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
            placeholder="Provide detailed work instructions, site access info, safety requirements..."
          />

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>Allowed Attachments / Forms</Typography>
            <FormGroup row>
              {FORM_OPTIONS.map(opt => (
                <FormControlLabel
                  key={opt.key}
                  control={
                    <Checkbox
                      checked={form.allowed_forms.includes(opt.key)}
                      onChange={() => toggleForm(opt.key)}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{opt.label}</Typography>}
                />
              ))}
            </FormGroup>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>Contractor Visibility Rules</Typography>
            <FormGroup row>
              {VISIBILITY_OPTIONS.map(opt => (
                <FormControlLabel
                  key={opt.key}
                  control={
                    <Checkbox
                      checked={form.visibility_rules.includes(opt.key)}
                      onChange={() => toggleVisibility(opt.key)}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{opt.label}</Typography>}
                />
              ))}
            </FormGroup>
          </Box>
        </Box>
      )}
    </Box>
  );

  if (standalone) {
    return (
      <Box>
        <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <AssignmentIcon />
          <Typography variant="h5" fontWeight={700}>Work Order Dispatch</Typography>
        </Box>
        <Paper sx={{ p: 3, maxWidth: 720 }}>
          {content}
          {!successRef && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={dispatchMutation.isLoading ? <CircularProgress size={16} /> : <SendIcon />}
                onClick={handleSubmit}
                disabled={dispatchMutation.isLoading}
              >
                Dispatch Work Order
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AssignmentIcon />
          Dispatch Work Order to Contractor
        </Box>
      </DialogTitle>
      <DialogContent dividers>{content}</DialogContent>
      {!successRef && (
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={dispatchMutation.isLoading ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={handleSubmit}
            disabled={dispatchMutation.isLoading}
          >
            Dispatch Work Order
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
