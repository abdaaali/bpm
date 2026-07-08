import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel,
  Chip, IconButton, Stack, Autocomplete, FormControlLabel, Checkbox,
  Accordion, AccordionSummary, AccordionDetails, Divider, Tooltip, Alert,
  Button, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { orgApi, approvalApi } from '../../api/client';
import { parseOptions, serializeOptions, slugify } from './startFormHelpers';

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  required: boolean;
  options?: string;
}

interface PropertiesPanelProps {
  modeler: any;
  slug?: string;
  processName?: string;
}

// Operational candidate groups used in BPMN that aren't backed by a role row.
const EXTRA_GROUPS = ['noc', 'field_engineer', 'security', 'logistics'];

// One-click form-field presets (common ITIL captures).
const FIELD_PRESETS: { label: string; field: Omit<FormField, never> }[] = [
  { label: 'Handler notes', field: { key: 'handlerNotes', label: 'Handler notes', type: 'textarea', required: true } },
  { label: 'Priority', field: { key: 'priority', label: 'Priority', type: 'select', required: true, options: 'critical:P1 - Critical,high:P2 - High,medium:P3 - Medium,low:P4 - Low' } },
  { label: 'Resolution code', field: { key: 'resolutionCode', label: 'Resolution code', type: 'select', required: true, options: 'fixed:Fixed,workaround:Workaround applied,config:Configuration change,no_fault:No fault found' } },
  { label: 'Outcome Y/N', field: { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: 'yes:Yes,no:No' } },
];

// Apply changes to the BPMN element directly
function applyToBpmn(modeler: any, element: any, patch: {
  name?: string;
  assignee?: string;
  candidateGroups?: string[];
  slaHours?: string;
  condition?: string;
  serviceType?: string;
  config?: string;
  formFields?: FormField[];
  formKey?: string;
}) {
  if (!modeler || !element) return;
  const modeling = modeler.get('modeling');
  const moddle = modeler.get('moddle');
  const eventBus = modeler.get('eventBus');
  const bo = element.businessObject;
  // NOTE: do NOT reassign bo.$attrs (e.g. `bo.$attrs = bo.$attrs || {}`). moddle's
  // Base constructor always defines $attrs as a non-writable-but-already-populated
  // property (`Object.defineProperty(this, '$attrs', { value: {} })`) on every
  // element, so it's never undefined — but reassigning the property itself throws
  // in strict mode (this file bundles as an ES module), silently aborting every
  // single property write below. Mutate its existing contents in place instead.

  if (patch.name !== undefined) {
    modeling.updateProperties(element, { name: patch.name || undefined });
  }
  if (patch.assignee !== undefined) {
    if (patch.assignee) bo.$attrs['camunda:assignee'] = patch.assignee;
    else delete bo.$attrs['camunda:assignee'];
  }
  if (patch.candidateGroups !== undefined) {
    if (patch.candidateGroups.length) bo.$attrs['camunda:candidateGroups'] = patch.candidateGroups.join(',');
    else delete bo.$attrs['camunda:candidateGroups'];
  }
  if (patch.slaHours !== undefined) {
    if (patch.slaHours) bo.$attrs['camunda:slaHours'] = patch.slaHours;
    else delete bo.$attrs['camunda:slaHours'];
  }
  if (patch.serviceType !== undefined) {
    if (patch.serviceType) bo.$attrs['camunda:serviceType'] = patch.serviceType;
    else delete bo.$attrs['camunda:serviceType'];
  }
  if (patch.config !== undefined) {
    if (patch.config.trim()) bo.$attrs['camunda:serviceConfig'] = patch.config.trim();
    else delete bo.$attrs['camunda:serviceConfig'];
  }
  if (patch.formKey !== undefined) {
    if (patch.formKey) bo.$attrs['camunda:formKey'] = patch.formKey;
    else delete bo.$attrs['camunda:formKey'];
  }
  if (patch.formFields !== undefined) {
    if (patch.formFields.length > 0) {
      bo.$attrs['camunda:formFields'] = encodeURIComponent(JSON.stringify(patch.formFields));
    } else {
      delete bo.$attrs['camunda:formFields'];
    }
  }
  if (patch.condition !== undefined && element.type === 'bpmn:SequenceFlow') {
    if (patch.condition.trim()) {
      bo.conditionExpression = moddle.create('bpmn:FormalExpression', { body: patch.condition.trim() });
    } else {
      bo.conditionExpression = undefined;
    }
  }

  eventBus.fire('elements.changed', { elements: [element] });
}

// Collect every form field defined across the model (userTasks + startEvent),
// plus the synthetic `decision` variable the engine injects after an approval —
// used to drive the condition builder so authors pick fields, not type expressions.
function collectModelFields(modeler: any): { key: string; label: string; type: string; options?: string; source: string }[] {
  const out: any[] = [
    { key: 'decision', label: 'Approval decision', type: 'select', options: 'approve:Approved,reject:Rejected', source: 'approval result' },
  ];
  try {
    const registry = modeler?.get('elementRegistry');
    registry?.getAll().forEach((el: any) => {
      const t = el.type?.replace('bpmn:', '');
      if (t !== 'UserTask' && t !== 'StartEvent') return;
      const raw = el.businessObject?.$attrs?.['camunda:formFields'] || el.businessObject?.$attrs?.['activiti:formFields'];
      if (!raw) return;
      try {
        const fields = JSON.parse(decodeURIComponent(raw));
        const src = el.businessObject?.name || el.id;
        fields.forEach((f: any) => out.push({ ...f, source: src }));
      } catch { /* ignore malformed */ }
    });
  } catch { /* registry not ready */ }
  const seen = new Set<string>();
  return out.filter(f => f.key && !seen.has(f.key) && (seen.add(f.key), true));
}

// Section header with divider
function SectionHeader({ title }: { title: string }) {
  return (
    <Box sx={{ px: 2, py: 1, bgcolor: '#f8f8f8', borderTop: '1px solid #e8e8e8', borderBottom: '1px solid #e8e8e8', mt: 1 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </Typography>
    </Box>
  );
}

// ── Structured option editor (value/label rows, id:label serialization) ──────
function OptionsEditor({ value, onChange }: { value?: string; onChange: (s: string) => void }) {
  const rows = parseOptions(value);
  const update = (next: { value: string; label: string }[]) => onChange(serializeOptions(next));
  return (
    <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 1 }}>
      <Typography variant="caption" color="text.secondary">Dropdown options</Typography>
      {rows.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', my: 0.5 }}>
          No options yet.
        </Typography>
      )}
      {rows.map((o, i) => (
        <Box key={i} display="flex" gap={0.5} alignItems="center" mt={0.5}>
          <TextField size="small" label="Label" value={o.label}
            onChange={e => {
              const label = e.target.value;
              const next = rows.map((r, j) => j === i
                ? { label, value: r.value && r.value !== slugify(r.label) ? r.value : slugify(label) }
                : r);
              update(next);
            }} sx={{ flex: 1 }} />
          <TextField size="small" label="Value (id)" value={o.value}
            onChange={e => update(rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
            sx={{ flex: 1 }}
            helperText="used in conditions" />
          <IconButton size="small" onClick={() => update(rows.filter((_, j) => j !== i))}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5 }}
        onClick={() => {
          // A fully-blank {value:'',label:''} row is indistinguishable from
          // "no option" and gets silently dropped by serializeOptions/parseOptions
          // on the very next round-trip — clicking Add option would then appear
          // to do nothing. Seed a non-empty default label (same pattern as
          // FormFieldEditor.addField below) so the new row actually survives
          // and is immediately visible to rename.
          update([...rows, { value: '', label: `Option ${rows.length + 1}` }]);
        }}>
        Add option
      </Button>
    </Box>
  );
}

// ── Shared form-field editor (used by user task + start event) ───────────────
function FormFieldEditor({ fields, onChange, addLabel }: {
  fields: FormField[]; onChange: (f: FormField[]) => void; addLabel: string;
}) {
  // key must equal slugify(label) so the label's onChange below (which only
  // re-derives the key while key === slugify(label)) keeps auto-syncing it —
  // a literal `field${n}` here never matches slugify(`Field ${n}`) (missing
  // underscore), silently freezing the key at "field1" no matter what label
  // the user types.
  const addField = () => onChange([...fields, { key: slugify(`Field ${fields.length + 1}`), label: `Field ${fields.length + 1}`, type: 'text', required: false }]);
  const updateField = (idx: number, patch: Partial<FormField>) => onChange(fields.map((f, i) => i === idx ? { ...f, ...patch } : f));
  const removeField = (idx: number) => onChange(fields.filter((_, i) => i !== idx));
  const uniqueKey = (base: string) => {
    let k = base, n = 2;
    const keys = new Set(fields.map(f => f.key));
    while (keys.has(k)) k = `${base}${n++}`;
    return k;
  };
  const addPreset = (p: FormField) => onChange([...fields, { ...p, key: uniqueKey(p.key) }]);

  return (
    <>
      {fields.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          No fields yet. Add fields below to build the form.
        </Typography>
      )}
      {fields.map((f, idx) => (
        <Accordion key={idx} disableGutters elevation={0}
          sx={{ border: '1px solid #e0e0e0', borderRadius: '6px !important', mb: 1, '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 40, py: 0, px: 1.5 }}>
            <Box display="flex" alignItems="center" gap={1} width="100%">
              <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontWeight: 500, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.label || f.key || `Field ${idx + 1}`}
              </Typography>
              <Chip label={f.type} size="small" sx={{ fontSize: 10, height: 18, flexShrink: 0 }} />
              {f.required && <Chip label="required" size="small" color="warning" sx={{ fontSize: 10, height: 18, flexShrink: 0 }} />}
              <Tooltip title="Remove field">
                <IconButton size="small" onClick={e => { e.stopPropagation(); removeField(idx); }} sx={{ p: 0.25, flexShrink: 0 }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0 }}>
            <Stack spacing={1.5}>
              <TextField size="small" fullWidth label="Display label"
                value={f.label}
                onChange={e => {
                  const label = e.target.value;
                  // keep key in sync until the user hand-edits it
                  const autoKey = !f.key || f.key === slugify(f.label);
                  updateField(idx, autoKey ? { label, key: slugify(label) || f.key } : { label });
                }}
              />
              <TextField size="small" fullWidth label="Variable key"
                value={f.key}
                onChange={e => updateField(idx, { key: e.target.value })}
                helperText="Used in conditions, e.g. ${priority}"
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Field type</InputLabel>
                <Select label="Field type" value={f.type} data-testid="form-field-type-select"
                  onChange={e => updateField(idx, { type: e.target.value as FormField['type'] })}>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="textarea">Textarea</MenuItem>
                  <MenuItem value="number">Number</MenuItem>
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="select">Dropdown</MenuItem>
                  <MenuItem value="checkbox">Checkbox</MenuItem>
                </Select>
              </FormControl>
              {f.type === 'select' && (
                <OptionsEditor value={f.options} onChange={opts => updateField(idx, { options: opts })} />
              )}
              <FormControlLabel
                control={<Checkbox size="small" checked={f.required} onChange={e => updateField(idx, { required: e.target.checked })} />}
                label={<Typography variant="body2">Required field</Typography>}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Quick-add presets */}
      <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
        {FIELD_PRESETS.map(p => (
          <Chip key={p.label} label={`+ ${p.label}`} size="small" variant="outlined"
            onClick={() => addPreset(p.field)} sx={{ fontSize: 11 }} />
        ))}
      </Box>
      <Box onClick={addField}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
          border: '1px dashed #bdbdbd', borderRadius: 1.5, cursor: 'pointer', color: 'text.secondary',
          '&:hover': { bgcolor: '#f5f5f5', borderColor: 'primary.main', color: 'primary.main' },
          transition: 'all 0.15s',
        }}>
        <AddIcon fontSize="small" />
        <Typography variant="body2">{addLabel}</Typography>
      </Box>
    </>
  );
}

// ── Condition builder for a sequence flow ────────────────────────────────────
const OPERATORS = ['==', '!=', '>=', '<=', '>', '<'];
function buildExpr(field: string, op: string, val: string): string {
  if (!field || !val) return '';
  const numeric = ['>=', '<=', '>', '<'].includes(op);
  return numeric ? `\${${field} ${op} ${val}}` : `\${${field} ${op} "${val}"}`;
}
function parseExpr(expr: string): { field: string; op: string; val: string } | null {
  const m = (expr || '').match(/\$\{\s*([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*"?([^"}]*?)"?\s*\}/);
  return m ? { field: m[1], op: m[2], val: m[3] } : null;
}
function ConditionBuilder({ value, fields, onChange }: {
  value: string; fields: { key: string; label: string; type: string; options?: string; source: string }[]; onChange: (expr: string) => void;
}) {
  const parsed = parseExpr(value);
  const [field, setField] = useState(parsed?.field || '');
  const [op, setOp] = useState(parsed?.op || '==');
  const [val, setVal] = useState(parsed?.val || '');
  useEffect(() => {
    const p = parseExpr(value);
    setField(p?.field || ''); setOp(p?.op || '=='); setVal(p?.val || '');
  }, [value]);

  const selected = fields.find(f => f.key === field);
  const opts = selected?.options ? parseOptions(selected.options) : [];
  const emit = (f: string, o: string, v: string) => onChange(buildExpr(f, o, v));

  return (
    <Box sx={{ border: '1px solid #e3f2fd', bgcolor: '#f7fbff', borderRadius: 1, p: 1.25, mb: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>Condition builder</Typography>
      <Stack spacing={1} mt={0.5}>
        <FormControl size="small" fullWidth>
          <InputLabel>When field</InputLabel>
          <Select label="When field" value={fields.some(f => f.key === field) ? field : ''}
            onChange={e => { setField(e.target.value); setVal(''); emit(e.target.value, op, ''); }}>
            {fields.map(f => (
              <MenuItem key={f.key} value={f.key}>{f.label || f.key} <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>· {f.source}</Typography></MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ width: 90 }}>
            <InputLabel>Is</InputLabel>
            <Select label="Is" value={op} onChange={e => { setOp(e.target.value); emit(field, e.target.value, val); }}>
              {OPERATORS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </Select>
          </FormControl>
          {opts.length ? (
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Value</InputLabel>
              <Select label="Value" value={opts.some(o => o.value === val) ? val : ''}
                onChange={e => { setVal(e.target.value); emit(field, op, e.target.value); }}>
                {opts.map(o => <MenuItem key={o.value} value={o.value}>{o.label} <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>({o.value})</Typography></MenuItem>)}
              </Select>
            </FormControl>
          ) : (
            <TextField size="small" sx={{ flex: 1 }} label="Value" value={val}
              onChange={e => { setVal(e.target.value); emit(field, op, e.target.value); }} />
          )}
        </Box>
      </Stack>
    </Box>
  );
}

// ── Inline approval policy section ───────────────────────────────────────────
function blankStep() {
  return { id: `step_${Math.floor(Math.random() * 1e9)}`, label: 'Approver', type: 'hierarchy', hierarchyLevel: 1, roleKey: '', userId: '', slaHours: 24, parallel: false };
}
function ApprovalPolicySection({ slug, processName, roles, users }: {
  slug?: string; processName?: string; roles: any[]; users: any[];
}) {
  const qc = useQueryClient();
  const { data: policiesData, isLoading } = useQuery('approval-policies', () => approvalApi.listPolicies(1, 100), { staleTime: 30000 });
  const linked = (policiesData?.data || []).find((p: any) => p.process_key === slug && p.active);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<any[]>([blankStep()]);
  useEffect(() => { setName(`${processName || slug || 'Process'} Approval`); }, [processName, slug]);

  const create = useMutation(
    () => approvalApi.createPolicy({ name, processKey: slug, active: true, steps }),
    { onSuccess: () => { qc.invalidateQueries('approval-policies'); setCreating(false); } },
  );

  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      {isLoading ? <CircularProgress size={18} /> : linked ? (
        <Alert icon={<CheckCircleIcon fontSize="inherit" />} severity="success" sx={{ fontSize: 12 }}>
          Approval policy linked: <strong>{linked.name}</strong> ({(linked.steps || []).length} step{(linked.steps || []).length === 1 ? '' : 's'}). The process will park here until approved.
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ fontSize: 12 }}>
          No approval policy for this process yet — approvals would fall back to a manual task. Create one below.
        </Alert>
      )}

      {!linked && !creating && (
        <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setCreating(true)}>
          Create approval policy
        </Button>
      )}

      {!linked && creating && (
        <Box sx={{ mt: 1.5, border: '1px solid #e0e0e0', borderRadius: 1, p: 1.5 }}>
          <TextField size="small" fullWidth label="Policy name" value={name} onChange={e => setName(e.target.value)} sx={{ mb: 1.5 }} />
          {steps.map((s, i) => (
            <Box key={s.id} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1, mb: 1 }}>
              <Box display="flex" gap={0.5} alignItems="center">
                <Typography variant="caption" sx={{ flexGrow: 1 }}>Step {i + 1}</Typography>
                {steps.length > 1 && (
                  <IconButton size="small" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><DeleteIcon fontSize="small" /></IconButton>
                )}
              </Box>
              <Stack spacing={1} mt={0.5}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Approver</InputLabel>
                  <Select label="Approver" value={s.type === 'hierarchy' ? `hierarchy${s.hierarchyLevel}` : s.type}
                    onChange={e => {
                      const v = e.target.value as string;
                      setSteps(steps.map((x, j) => j !== i ? x : (
                        v === 'hierarchy1' ? { ...x, type: 'hierarchy', hierarchyLevel: 1 } :
                        v === 'hierarchy2' ? { ...x, type: 'hierarchy', hierarchyLevel: 2 } :
                        { ...x, type: v }
                      )));
                    }}>
                    <MenuItem value="hierarchy1">Line manager</MenuItem>
                    <MenuItem value="hierarchy2">Department head</MenuItem>
                    <MenuItem value="role">Specific role</MenuItem>
                    <MenuItem value="specific_user">Specific user</MenuItem>
                  </Select>
                </FormControl>
                {s.type === 'role' && (
                  <FormControl size="small" fullWidth>
                    <InputLabel>Role</InputLabel>
                    <Select label="Role" value={s.roleKey || ''} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, roleKey: e.target.value } : x))}>
                      {roles.map((r: any) => <MenuItem key={r.key} value={r.key}>{r.name || r.key}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {s.type === 'specific_user' && (
                  <Autocomplete size="small" options={users}
                    getOptionLabel={(u: any) => u.display_name || u.username || u.email || ''}
                    onChange={(_, v: any) => setSteps(steps.map((x, j) => j === i ? { ...x, userId: v?.id || '' } : x))}
                    renderInput={(p) => <TextField {...p} label="User" />} />
                )}
                <TextField size="small" type="number" label="SLA (hours)" value={s.slaHours}
                  onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, slaHours: Number(e.target.value) } : x))} />
              </Stack>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setSteps([...steps, blankStep()])}>Add step</Button>
          <Box display="flex" gap={1} mt={1}>
            <Button size="small" variant="contained" disabled={create.isLoading || !name.trim()} onClick={() => create.mutate()}>
              {create.isLoading ? 'Creating…' : 'Create policy'}
            </Button>
            <Button size="small" onClick={() => setCreating(false)}>Cancel</Button>
          </Box>
          {create.isError && <Alert severity="error" sx={{ mt: 1, fontSize: 12 }}>Could not create policy.</Alert>}
        </Box>
      )}
    </Box>
  );
}

export default function PropertiesPanel({ modeler, slug, processName }: PropertiesPanelProps) {
  const [element, setElement] = useState<any>(null);
  const [name, setName] = useState('');
  const [assignee, setAssignee] = useState('');
  const [candidateGroups, setCandidateGroups] = useState<string[]>([]);
  const [slaHours, setSlaHours] = useState('');
  const [condition, setCondition] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [config, setConfig] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formKey, setFormKey] = useState('');
  const elementRef = useRef<any>(null);

  const { data: rolesData } = useQuery('roles', () => orgApi.getRoles(), { staleTime: 60000 });
  const { data: usersData } = useQuery(['users', 'panel'], () => orgApi.getUsers(1, 200), { staleTime: 60000 });

  useEffect(() => {
    if (!modeler) return;
    const eventBus = modeler.get('eventBus');
    const handler = ({ newSelection }: any) => {
      const el = newSelection?.[0] || null;
      setElement(el);
      elementRef.current = el;
      if (!el) return;
      const bo = el.businessObject;
      setName(bo.name || '');
      setAssignee(bo.$attrs?.['camunda:assignee'] || '');
      const cg = bo.$attrs?.['camunda:candidateGroups'] || '';
      setCandidateGroups(cg ? cg.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
      setSlaHours(bo.$attrs?.['camunda:slaHours'] || '');
      setCondition(bo.conditionExpression?.body || '');
      setServiceType(bo.$attrs?.['camunda:serviceType'] || '');
      setConfig(bo.$attrs?.['camunda:serviceConfig'] || '');
      setFormKey(bo.$attrs?.['camunda:formKey'] || bo.$attrs?.['activiti:formKey'] || '');
      // Accept either prefix — launch processes were authored with `activiti:`.
      const ffRaw = bo.$attrs?.['camunda:formFields'] || bo.$attrs?.['activiti:formFields'] || '';
      try { setFormFields(ffRaw ? JSON.parse(decodeURIComponent(ffRaw)) : []); }
      catch { setFormFields([]); }
    };
    eventBus.on('selection.changed', handler);
    return () => eventBus.off('selection.changed', handler);
  }, [modeler]);

  const applyPatch = useCallback((patch: Parameters<typeof applyToBpmn>[2]) => {
    applyToBpmn(modeler, elementRef.current, patch);
  }, [modeler]);

  const updateFormFields = (next: FormField[]) => { setFormFields(next); applyPatch({ formFields: next }); };

  if (!element) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', mt: 4 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Select an element on the canvas to edit its properties.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Tip: drag elements from the left palette; connect them by hovering and dragging the arrows.
        </Typography>
      </Box>
    );
  }

  const rawType = element.type?.replace('bpmn:', '') || '';
  const isUserTask = rawType === 'UserTask';
  const isStartEvent = rawType === 'StartEvent';
  const isServiceTask = rawType === 'ServiceTask';
  const isFlow = rawType === 'SequenceFlow';
  const isGateway = rawType.includes('Gateway');
  const isApprovalGate = isUserTask && formKey === 'approval';

  const roles: any[] = rolesData?.data || [];
  const users: any[] = usersData?.data || [];
  // Candidate-group options: real roles + operational groups not backed by a role.
  const groupOptions: { key: string; name: string }[] = [
    ...roles.map(r => ({ key: r.key, name: r.name || r.key })),
    ...EXTRA_GROUPS.filter(g => !roles.some(r => r.key === g)).map(g => ({ key: g, name: g })),
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Element type badge */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Chip label={isApprovalGate ? 'Approval gate' : rawType || 'Element'} size="small" variant="outlined" sx={{ mb: 1.5, fontSize: 11 }} color={isApprovalGate ? 'primary' : 'default'} />
        <TextField
          size="small" fullWidth
          label={isFlow ? 'Label' : 'Name'}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => applyPatch({ name })}
          helperText="Press Tab or click elsewhere to apply"
        />
      </Box>

      {/* Sequence Flow */}
      {isFlow && (
        <>
          <SectionHeader title="Flow Condition" />
          <Box sx={{ px: 2, py: 1.5 }}>
            <ConditionBuilder
              value={condition}
              fields={collectModelFields(modeler)}
              onChange={(expr) => { setCondition(expr); applyPatch({ condition: expr }); }}
            />
            <TextField
              size="small" fullWidth label="Expression (advanced)"
              value={condition}
              onChange={e => setCondition(e.target.value)}
              onBlur={() => applyPatch({ condition })}
              multiline rows={2}
              placeholder="${decision == &quot;approve&quot;}"
              helperText="Auto-filled by the builder. Leave blank for an unconditional/default flow."
            />
          </Box>
        </>
      )}

      {/* Gateway hint */}
      {isGateway && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Alert severity="info" sx={{ fontSize: 12 }}>
            Set conditions on the outgoing arrows (click an arrow, then use the condition builder).
          </Alert>
        </Box>
      )}

      {/* User Task */}
      {isUserTask && (
        <>
          <SectionHeader title="Task Behaviour" />
          <Box sx={{ px: 2, py: 1.5 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Behaviour</InputLabel>
              <Select label="Behaviour" value={isApprovalGate ? 'approval' : 'human'}
                onChange={e => {
                  const v = e.target.value;
                  const fk = v === 'approval' ? 'approval' : '';
                  setFormKey(fk); applyPatch({ formKey: fk });
                }}>
                <MenuItem value="human">Human task (someone does work)</MenuItem>
                <MenuItem value="approval">Approval gate (parks for a decision)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {isApprovalGate ? (
            <>
              <SectionHeader title="Approval Policy" />
              <ApprovalPolicySection slug={slug} processName={processName} roles={roles} users={users} />
              <Box sx={{ px: 2, pb: 1.5 }}>
                <Alert severity="info" sx={{ fontSize: 11 }}>
                  After approval the engine sets <code>decision</code> to <code>approve</code>/<code>reject</code>.
                  Add two outgoing arrows and use the condition builder (field “Approval decision”) to branch.
                </Alert>
              </Box>
            </>
          ) : (
            <>
              <SectionHeader title="Assignment" />
              <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Autocomplete
                  size="small" freeSolo
                  options={users}
                  getOptionLabel={(u: any) => typeof u === 'string' ? u : (u.display_name || u.username || u.email || '')}
                  value={users.find((u: any) => u.id === assignee || u.username === assignee) || assignee}
                  onChange={(_, v) => {
                    const val = !v ? '' : typeof v === 'string' ? v : ((v as any).username || (v as any).id || '');
                    setAssignee(val); applyPatch({ assignee: val });
                  }}
                  onInputChange={(_, v, reason) => { if (reason === 'input') setAssignee(v); }}
                  onBlur={() => applyPatch({ assignee })}
                  renderInput={(p) => <TextField {...p} label="Assignee (optional)" />}
                />
                <Autocomplete
                  size="small" multiple freeSolo
                  options={groupOptions}
                  getOptionLabel={(r: any) => typeof r === 'string' ? r : (r.name || r.key || '')}
                  value={groupOptions.filter((r) => candidateGroups.includes(r.key))}
                  onChange={(_, v) => {
                    const groups = (v as any[]).map(r => typeof r === 'string' ? r : r.key);
                    setCandidateGroups(groups); applyPatch({ candidateGroups: groups });
                  }}
                  renderInput={(p) => <TextField {...p} label="Candidate Groups" helperText="Who can claim this task" />}
                  renderTags={(v, gp) =>
                    (v as any[]).map((r, i) => <Chip {...gp({ index: i })} key={typeof r === 'string' ? r : r.key} label={typeof r === 'string' ? r : r.name} size="small" />)
                  }
                />
                <TextField
                  size="small" fullWidth label="SLA (hours)" type="number"
                  value={slaHours}
                  onChange={e => setSlaHours(e.target.value)}
                  onBlur={() => applyPatch({ slaHours })}
                  inputProps={{ min: 0, step: 0.5 }}
                  helperText="Leave blank for no SLA"
                />
              </Box>

              <SectionHeader title="Task Form Fields" />
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <FormFieldEditor fields={formFields} onChange={updateFormFields} addLabel="Add form field" />
              </Box>
            </>
          )}
        </>
      )}

      {/* Start Event */}
      {isStartEvent && (
        <>
          <SectionHeader title="Start Form Fields" />
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Alert severity="info" sx={{ fontSize: 11, py: 0.5, mb: 1.5 }}>
              Fields here appear as a form when someone starts this process.
            </Alert>
            <FormFieldEditor fields={formFields} onChange={updateFormFields} addLabel="Add start form field" />
          </Box>
        </>
      )}

      {/* Service Task */}
      {isServiceTask && (
        <>
          <SectionHeader title="Service Configuration" />
          <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Service Type</InputLabel>
              <Select label="Service Type" value={serviceType}
                onChange={e => { setServiceType(e.target.value); applyPatch({ serviceType: e.target.value }); }}>
                <MenuItem value="">— None —</MenuItem>
                <MenuItem value="notification">Notification</MenuItem>
                <MenuItem value="connector">External Connector</MenuItem>
                <MenuItem value="script">Script / Logic</MenuItem>
              </Select>
            </FormControl>
            <Alert severity="info" sx={{ fontSize: 11 }}>
              Need an approval? Use a <strong>User Task</strong> set to “Approval gate”.
            </Alert>
            <TextField
              size="small" fullWidth label="Config (JSON)"
              value={config}
              onChange={e => setConfig(e.target.value)}
              onBlur={() => applyPatch({ config })}
              multiline rows={5}
              placeholder={'{\n  "key": "value"\n}'}
              helperText="Applied on blur"
              sx={{ fontFamily: 'monospace' }}
            />
          </Box>
        </>
      )}

      <Divider sx={{ mt: 'auto' }} />
      <Box sx={{ px: 2, py: 1, bgcolor: '#fafafa' }}>
        <Typography variant="caption" color="text.disabled">
          Changes apply automatically. Save the diagram with the Save button above.
        </Typography>
      </Box>
    </Box>
  );
}
