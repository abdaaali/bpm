/**
 * Shared helpers for the "New Request / Start Process" form.
 * Used by both ProcessInstances.tsx and Dashboard.tsx.
 */
import React, { useState } from 'react';
import {
  Box, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, Typography, Button,
  Stack, Chip, CircularProgress,
} from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'date' | 'checkbox' | 'file';
  required?: boolean;
  options?: string; // comma-separated values for select
  placeholder?: string;
  default?: string;
};

export type FallbackForm = {
  bizKeyPrefix: string;
  description: string;
  fields: FieldDef[];
};

// ── Parse start-event form fields from BPMN XML ───────────────────────────────

export function parseStartFormFields(bpmnXml: string): FieldDef[] | null {
  try {
    const doc = new DOMParser().parseFromString(bpmnXml, 'text/xml');
    const se  = doc.querySelector('startEvent') || doc.getElementsByTagName('startEvent')[0];
    if (!se) return null;
    // The same formFields attribute is authored under different vendor prefixes
    // (Studio writes camunda:, the seed/launch processes use activiti:). Accept
    // any of them — otherwise the request form renders empty for those processes.
    const raw = se.getAttribute('camunda:formFields')
      || se.getAttribute('activiti:formFields')
      || se.getAttribute('flowable:formFields')
      || se.getAttribute('bpm:formFields');
    if (!raw)  return null;
    const parsed: any[] = JSON.parse(decodeURIComponent(raw));
    if (!parsed?.length) return null;
    return parsed.map((f: any) => ({
      key:      f.key   || f.id   || '',
      label:    f.label || f.key  || f.id || '',
      type:     (f.type as FieldDef['type']) || 'text',
      required: !!f.required,
      options:  f.options  || '',
      default:  f.default  || '',
    }));
  } catch {
    return null;
  }
}

// ── Fallback schemas for the 3 built-in demo processes ────────────────────────

const YEAR = new Date().getFullYear();

export const FALLBACK_FORMS: Record<string, FallbackForm> = {
  purchase_request: {
    bizKeyPrefix: `PR-${YEAR}-`,
    description: 'Request approval to purchase goods or services.',
    fields: [
      { key: 'requestedAmount', label: 'Requested Amount (USD)', type: 'number', required: true, placeholder: '0.00' },
      { key: 'department', label: 'Department', type: 'select', required: true,
        options: 'IT,Finance,Human Resources,Operations,Legal,Other' },
      { key: 'urgency', label: 'Urgency', type: 'select', required: true, default: 'medium',
        options: 'low,medium,high' },
      { key: 'justification', label: 'Justification', type: 'textarea', required: true,
        placeholder: 'Describe the reason for this purchase request…' },
    ],
  },
  change_management: {
    bizKeyPrefix: `CHG-${YEAR}-`,
    description: 'Manage and track planned changes to systems or services.',
    fields: [
      { key: 'changeTitle', label: 'Change Title', type: 'text', required: true,
        placeholder: 'Brief title for the change' },
      { key: 'changeType', label: 'Change Type', type: 'select', required: true,
        options: 'standard,normal,emergency' },
      { key: 'affectedSystem', label: 'Affected System', type: 'text', required: true,
        placeholder: 'e.g. ERP, CRM, Network…' },
      { key: 'riskLevel', label: 'Risk Level', type: 'select', required: true,
        options: 'low,medium,high' },
      { key: 'plannedDate', label: 'Planned Date', type: 'date' },
    ],
  },
  incident_management: {
    bizKeyPrefix: `INC-${YEAR}-`,
    description: 'Report and track IT incidents and service outages.',
    fields: [
      { key: 'severity', label: 'Severity', type: 'select', required: true,
        options: 'P1 — Critical,P2 — High,P3 — Medium,P4 — Low' },
      { key: 'affectedService', label: 'Affected Service', type: 'text', required: true,
        placeholder: 'e.g. Email, VPN, Database…' },
      { key: 'category', label: 'Category', type: 'select',
        options: 'hardware,software,network,security,other' },
      { key: 'description', label: 'Description', type: 'textarea', required: true,
        placeholder: 'Describe the incident in detail…' },
    ],
  },
};

export const BIZ_PREFIXES: Record<string, string> = {
  purchase_request:    `PR-${YEAR}-`,
  change_management:   `CHG-${YEAR}-`,
  incident_management: `INC-${YEAR}-`,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export function genBizKey(prefix: string) {
  return `${prefix}${String(Date.now()).slice(-6)}`;
}

// Read a task/instance's persisted form schema from its variables (`_formSchema`,
// which may be a JSON string or an already-parsed array).
export function getFormSchema(variables: any): FieldDef[] {
  try {
    const raw = variables?._formSchema;
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Parse a comma-separated options string into {value,label} pairs. Each option
// may be either a plain token ("high" → value=label="high") or an "id:label"
// pair ("yes:Yes - service restored" → value="yes", label="Yes - service
// restored"). The value (id) is what gets submitted and what gateway conditions
// compare against; the label is what the user sees.
export function parseOptions(options?: string): { value: string; label: string }[] {
  return (options || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .map(o => {
      const idx = o.indexOf(':');
      if (idx === -1) return { value: o, label: o };
      return { value: o.slice(0, idx).trim(), label: o.slice(idx + 1).trim() };
    });
}

// Slugify a label into a stable option id/value (lowercase, non-alnum → _).
export function slugify(label: string): string {
  return (label || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Serialize {value,label} option rows back into the "id:label,id:label" string.
// A row whose value equals its label collapses to a plain token.
export function serializeOptions(opts: { value: string; label: string }[]): string {
  return opts
    .filter(o => (o.value || o.label || '').trim())
    .map(o => {
      const value = (o.value || slugify(o.label)).trim();
      const label = (o.label || o.value).trim();
      return value === label ? value : `${value}:${label}`;
    })
    .join(',');
}

// Resolve a stored option value back to its human label for display.
export function optionLabel(options: string | undefined, value: any): string {
  if (value == null || value === '') return '';
  const found = parseOptions(options).find(o => o.value === String(value));
  return found ? found.label : String(value);
}

export function buildInitialValues(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  fields.forEach(f => { out[f.key] = f.default ?? ''; });
  return out;
}

export function isFormComplete(fields: FieldDef[], values: Record<string, string>) {
  return fields.every(f => !f.required || (values[f.key] ?? '').trim() !== '');
}

// ── File field helpers ──────────────────────────────────────────────────────

type UploadedFile = { id: string; name: string; type: string; size?: number };

// A 'file' field's value is a JSON array of {id,name,type,size} (multi-file) —
// falls back to treating a bare attachment-id string as a single legacy item.
function parseFileValue(value: string): UploadedFile[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON — legacy single-id value */ }
  return [{ id: value, name: 'uploaded file', type: '' }];
}

function fileTypeIcon(type: string) {
  if (type.startsWith('image/')) return <ImageIcon fontSize="small" />;
  if (type === 'application/pdf') return <PictureAsPdfIcon fontSize="small" />;
  return <InsertDriveFileIcon fontSize="small" />;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Single dynamic field renderer ─────────────────────────────────────────────

export function DynField({ field, value, onChange }: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'file') {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const files = parseFileValue(value);

    // Takes a plain File[] snapshot, NOT the input's live FileList — reading
    // `input.files` returns a reference that's tied to the input element, and
    // clearing `input.value` (done immediately on selection, below, so the
    // same file can be re-selected later) empties that SAME FileList object
    // out from under any in-flight async code still holding a reference to
    // it. Awaiting the dynamic import before ever touching the list was
    // enough for the browser to already clear it — every upload silently ran
    // over zero files, so nothing ever actually uploaded. Snapshotting into a
    // plain array up front avoids depending on the live FileList at all.
    const handleFiles = async (fileList: File[]) => {
      if (!fileList.length) return;
      setUploading(true);
      setUploadError('');
      try {
        const { attachmentApi } = await import('../../api/client');
        const uploaded: UploadedFile[] = [];
        for (const f of fileList) {
          // Nil UUID: a fixed, always-valid placeholder satisfying
          // attachments.entity_id's NOT NULL uuid column — the file's real
          // ownership is tracked by its own attachment id (recorded in this
          // field's value), not by this staging entityId, so it doesn't need
          // to be unique per session. case-service re-homes the attachment
          // onto the real case once one exists — see reassignStagedAttachments
          // in case.service.ts, called from create().
          const att = await attachmentApi.upload('form-field-staging', '00000000-0000-0000-0000-000000000000', f);
          uploaded.push({ id: att.id, name: f.name, type: f.type, size: f.size });
        }
        const merged = [...files, ...uploaded];
        // '' not '[]' when there's nothing — see the same note in removeFile.
        onChange(merged.length ? JSON.stringify(merged) : '');
      } catch (e: any) {
        setUploadError(e?.response?.data?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    };

    const removeFile = async (id: string) => {
      // '' (not '[]') when the last file is removed, so isFormComplete's
      // `.trim() !== ''` required-field check correctly reads this as empty
      // again — "[]" is non-empty as a string and would falsely pass.
      const remaining = files.filter(f => f.id !== id);
      onChange(remaining.length ? JSON.stringify(remaining) : '');
      try {
        const { attachmentApi } = await import('../../api/client');
        await attachmentApi.remove(id);
      } catch { /* best-effort — staged file just goes unreferenced if this fails */ }
    };

    return (
      <Box>
        <Typography variant="body2" sx={{ mb: 0.5 }}>{field.label}{field.required && ' *'}</Typography>
        <Button component="label" size="small" variant="outlined" disabled={uploading}
          startIcon={uploading ? <CircularProgress size={14} /> : undefined}>
          {uploading ? 'Uploading…' : files.length ? 'Add more files' : 'Choose file(s)'}
          <input type="file" multiple hidden onChange={e => {
            const selected = Array.from(e.target.files || []);
            e.target.value = ''; // safe now — handleFiles already has its own plain-array copy
            handleFiles(selected);
          }} />
        </Button>
        {uploadError && <Typography variant="caption" color="error.main" display="block" mt={0.5}>{uploadError}</Typography>}
        {files.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1} mt={1}>
            {files.map(f => (
              <Chip
                key={f.id}
                icon={fileTypeIcon(f.type)}
                label={`${f.name}${f.size ? ` (${formatFileSize(f.size)})` : ''}`}
                onDelete={() => removeFile(f.id)}
                deleteIcon={<CloseIcon fontSize="small" />}
                variant="outlined" size="small" />
            ))}
          </Stack>
        )}
      </Box>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <FormControlLabel
        control={<Checkbox checked={value === 'true'} onChange={e => onChange(String(e.target.checked))} />}
        label={<Typography variant="body2">{field.label}{field.required && ' *'}</Typography>}
      />
    );
  }
  if (field.type === 'select') {
    const opts = parseOptions(field.options);
    return (
      <FormControl fullWidth size="small" required={field.required}>
        <InputLabel>{field.label}</InputLabel>
        <Select label={field.label} value={value} data-testid={`field-${field.key}`} onChange={e => onChange(e.target.value)}>
          {!field.required && <MenuItem value=""><em>— None —</em></MenuItem>}
          {opts.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </Select>
      </FormControl>
    );
  }
  if (field.type === 'textarea') {
    return (
      <TextField fullWidth size="small" multiline rows={3}
        label={field.label} required={field.required}
        placeholder={field.placeholder}
        value={value} onChange={e => onChange(e.target.value)}
      />
    );
  }
  return (
    <TextField
      fullWidth size="small"
      label={field.label} required={field.required}
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
      placeholder={field.placeholder}
      value={value} onChange={e => onChange(e.target.value)}
      InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
    />
  );
}
