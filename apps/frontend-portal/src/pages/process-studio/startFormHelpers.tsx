/**
 * Shared helpers for the "New Request / Start Process" form.
 * Used by both ProcessInstances.tsx and Dashboard.tsx.
 */
import React from 'react';
import {
  Box, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, Typography,
} from '@mui/material';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'date' | 'checkbox';
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

// ── Single dynamic field renderer ─────────────────────────────────────────────

export function DynField({ field, value, onChange }: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
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
