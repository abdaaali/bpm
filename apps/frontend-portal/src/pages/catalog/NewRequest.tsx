/**
 * NewRequest — Ivanti-style request submission form.
 * Loads a process definition, renders its form fields (from BPMN or fallback),
 * and submits as a CASE (caseApi.create with process_slug) so the request
 * becomes a normal case backed by the chosen process — the end user tracks it
 * in the unified case view, not a separate process screen.
 * Route: /catalog/:defId/new
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from 'react-query';
import {
  Box, Typography, Card, CardContent, Button, Grid, Alert,
  CircularProgress, Divider, Chip, Stepper, Step, StepLabel,
  LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { processApi, caseApi } from '../../api/client';
import {
  parseStartFormFields, FALLBACK_FORMS, genBizKey, BIZ_PREFIXES,
  buildInitialValues, isFormComplete, DynField, FieldDef,
} from '../process-studio/startFormHelpers';

// Reverse of the case-service TYPE_PROCESS map: pick a meaningful case type for
// the chosen process so type-specific case UI (e.g. change panels) still applies.
// Anything unmapped is a generic 'request'.
const SLUG_CASE_TYPE: Record<string, string> = {
  incident_management: 'incident',
  fault_management: 'fault',
  change_management: 'change',
  problem_management: 'problem',
  purchase_request: 'request',
  spare_parts: 'spare_part',
  asset_movement: 'asset_movement',
};

// ── What-happens-next steps per slug ─────────────────────────────────────────

const PROCESS_STEPS: Record<string, string[]> = {
  purchase_request:    ['Submit Request', 'Manager Review', 'Finance Approval', 'Order Placed', 'Completed'],
  change_management:   ['Submit RFC', 'CAB Review', 'Risk Assessment', 'Approval', 'Implementation', 'Closed'],
  incident_management: ['Report Incident', 'Triage', 'Investigation', 'Resolution', 'Closed'],
};

const DEFAULT_STEPS = ['Submit Request', 'Review', 'Approval', 'Fulfilment', 'Completed'];

// ── Derive display info from def ─────────────────────────────────────────────

function getFormFields(def: any): FieldDef[] {
  if (def.bpmn_xml) {
    const parsed = parseStartFormFields(def.bpmn_xml);
    if (parsed?.length) return parsed;
  }
  return FALLBACK_FORMS[def.slug]?.fields || [];
}

function getSlaLabel(slug: string): string {
  const map: Record<string, string> = {
    incident_management: '4 hours SLA',
    change_management: '5 business days',
    purchase_request: '3 business days',
  };
  return map[slug] || '1–3 business days';
}

// ── Submitted confirmation screen ────────────────────────────────────────────

function SubmittedScreen({ requestId, businessKey, onView }: { requestId: string; businessKey: string; onView: () => void }) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" mt={8} mb={4}>
      <CheckCircleOutlineIcon sx={{ fontSize: 72, color: 'success.main', mb: 2 }} />
      <Typography variant="h5" fontWeight={700} mb={1}>Request Submitted Successfully</Typography>
      <Typography variant="body1" color="text.secondary" mb={0.5}>
        Your request has been received and is being processed.
      </Typography>
      <Chip label={businessKey} color="primary" sx={{ my: 2, fontFamily: 'monospace', fontWeight: 600 }} />
      <Typography variant="body2" color="text.secondary" mb={3}>
        You can track the progress of your request at any time.
      </Typography>
      <Box display="flex" gap={2}>
        <Button variant="contained" onClick={onView}>Track My Request</Button>
        <Button variant="outlined" onClick={() => window.history.back()}>Back to Catalog</Button>
      </Box>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewRequest() {
  const { defId } = useParams<{ defId: string }>();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submittedKey, setSubmittedKey] = useState('');

  // Load process definition
  const { data: def, isLoading } = useQuery(
    ['proc-def', defId],
    () => processApi.getDef(defId!),
    { enabled: !!defId },
  );

  const fields: FieldDef[] = def ? getFormFields(def) : [];

  useEffect(() => {
    if (fields.length > 0) setValues(buildInitialValues(fields));
  }, [def?.id]);

  const bizKey = def ? (BIZ_PREFIXES[def.slug] ? genBizKey(BIZ_PREFIXES[def.slug]) : `REQ-${Date.now().toString().slice(-6)}`) : '';
  const steps = PROCESS_STEPS[def?.slug] || DEFAULT_STEPS;
  const slaLabel = def ? getSlaLabel(def.slug) : '';
  const formComplete = isFormComplete(fields, values);

  const submitMut = useMutation(
    () => caseApi.create({
      type: SLUG_CASE_TYPE[def!.slug] || 'request',
      title: values.subject || values.title || values.summary || def!.name,
      description: values.description || `Submitted via Service Catalog: ${def!.name}`,
      priority: values.priority || undefined,
      catalog_item: def!.name,
      context: values,        // start-form values; seeded into the process by case-service
      process_slug: def!.slug, // links + starts the chosen process behind the case
    }),
    {
      onSuccess: (c: any) => {
        setSubmittedId(c.id);
        setSubmittedKey(c.case_number || bizKey);
      },
      onError: (e: any) => setError(e.response?.data?.message || e.message || 'Failed to submit request'),
    },
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  }
  if (!def) {
    return <Alert severity="error">Service not found.</Alert>;
  }

  // ── Submitted confirmation ────────────────────────────────────────────────
  if (submittedId) {
    return <SubmittedScreen requestId={submittedId} businessKey={submittedKey} onView={() => navigate(`/cases/${submittedId}`)} />;
  }

  // ── Request form ──────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Back */}
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/catalog')} sx={{ mb: 2 }}>
        Service Catalog
      </Button>

      {/* Service header */}
      <Box sx={{ mb: 4, p: 3, borderRadius: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.100' }}>
        <Box display="flex" alignItems="center" gap={2} mb={1}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AccountTreeIcon sx={{ color: 'white', fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>{def.name}</Typography>
            <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
              {slaLabel && <Chip label={slaLabel} size="small" color="primary" variant="outlined" />}
              <Chip label={`v${def.version}`} size="small" variant="outlined" />
            </Box>
          </Box>
        </Box>
        {(def.description || FALLBACK_FORMS[def.slug]?.description) && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            {def.description || FALLBACK_FORMS[def.slug]?.description}
          </Typography>
        )}
      </Box>

      {/* Progress hint */}
      <Box mb={4}>
        <Typography variant="body2" color="text.secondary" mb={1.5}>What happens after you submit:</Typography>
        <Stepper alternativeLabel activeStep={0}>
          {steps.map((step, i) => (
            <Step key={step} completed={false}>
              <StepLabel
                StepIconProps={{ style: i === 0 ? {} : { color: '#bdbdbd' } }}
              >
                <Typography variant="caption">{step}</Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* ── Left: Request form ── */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={0.5}>Request Details</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Fill in the information below to submit your request.
                {fields.some(f => f.required) && ' Fields marked * are required.'}
              </Typography>

              {fields.length === 0 ? (
                <Alert severity="info" icon={<InfoOutlinedIcon />}>
                  No additional information is required for this request. Click "Submit" to proceed.
                </Alert>
              ) : (
                <Box display="flex" flexDirection="column" gap={2.5}>
                  {fields.map(f => (
                    <DynField
                      key={f.key}
                      field={f}
                      value={values[f.key] ?? ''}
                      onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))}
                    />
                  ))}
                </Box>
              )}

              {/* Form completion progress bar */}
              {fields.length > 0 && (
                <Box mt={3}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round(
                      (fields.filter(f => !f.required || (values[f.key] ?? '').trim() !== '').length / fields.length) * 100
                    )}
                    color={formComplete ? 'success' : 'primary'}
                    sx={{ borderRadius: 1, height: 6 }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    {fields.filter(f => f.required && !(values[f.key] ?? '').trim()).length === 0
                      ? 'All required fields complete'
                      : `${fields.filter(f => f.required && !(values[f.key] ?? '').trim()).length} required field(s) remaining`}
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 3 }} />

              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={!formComplete || submitMut.isLoading}
                  onClick={() => { setError(''); submitMut.mutate(); }}
                >
                  {submitMut.isLoading ? 'Submitting…' : 'Submit Request'}
                </Button>
                <Button variant="outlined" size="large" onClick={() => navigate('/catalog')}>
                  Cancel
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Right: Info sidebar ── */}
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>What to Expect</Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                {steps.map((step, i) => (
                  <Box key={step} display="flex" gap={1.5} alignItems="flex-start">
                    <Box sx={{
                      width: 24, height: 24, borderRadius: '50%',
                      bgcolor: i === 0 ? 'primary.main' : 'grey.200',
                      color: i === 0 ? 'white' : 'text.secondary',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, flexShrink: 0, mt: 0.1,
                    }}>
                      {i + 1}
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={i === 0 ? 600 : 400}
                        color={i === 0 ? 'text.primary' : 'text.secondary'}>
                        {step}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Service Info</Typography>
              <Box display="flex" flexDirection="column" gap={1.2}>
                {slaLabel && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">SLA</Typography>
                    <Typography variant="body2" fontWeight={500}>{slaLabel}</Typography>
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Version</Typography>
                  <Typography variant="body2" fontWeight={500}>{def.version}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Steps</Typography>
                  <Typography variant="body2" fontWeight={500}>{steps.length}</Typography>
                </Box>
                {fields.length > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Required fields</Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {fields.filter(f => f.required).length} / {fields.length}
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
