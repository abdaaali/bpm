import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Grid, TextField, Select, MenuItem, FormControl, InputLabel,
  Button, Chip, Divider, IconButton, Stack, Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { caseApi } from '../../api/client';

const METHODS = [
  { value: 'five_whys', label: '5 Whys' },
  { value: 'fishbone', label: 'Fishbone (Ishikawa)' },
  { value: 'generic', label: 'Free-form findings' },
];
const FISHBONE_CATS = ['people', 'process', 'technology', 'environment', 'external'];
const CAPA_STATUS = ['open', 'in_progress', 'done', 'verified', 'cancelled'];
const EFFECTIVENESS = ['pending', 'effective', 'ineffective'];

export default function RcaPanel({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data: rca } = useQuery(['rca', caseId], () => caseApi.getRca(caseId));
  const { data: capa = [] } = useQuery(['capa', caseId], () => caseApi.listCapa(caseId));

  const [method, setMethod] = useState('five_whys');
  const [summary, setSummary] = useState('');
  const [statement, setStatement] = useState('');
  const [status, setStatus] = useState('draft');
  const [analysis, setAnalysis] = useState<any>({ steps: [{ why: '', because: '' }] });

  useEffect(() => {
    if (rca) {
      setMethod(rca.method); setSummary(rca.summary || ''); setStatement(rca.root_cause_statement || '');
      setStatus(rca.status || 'draft'); setAnalysis(rca.analysis && Object.keys(rca.analysis).length ? rca.analysis : defaultAnalysis(rca.method));
    }
  }, [rca?.id]);

  function defaultAnalysis(m: string) {
    if (m === 'five_whys') return { steps: [{ why: '', because: '' }] };
    if (m === 'fishbone') return FISHBONE_CATS.reduce((a, c) => ({ ...a, [c]: [] }), {});
    return { findings: '' };
  }
  const switchMethod = (m: string) => { setMethod(m); setAnalysis(defaultAnalysis(m)); };

  const saveMut = useMutation(
    () => caseApi.saveRca(caseId, { method, summary, analysis, root_cause_statement: statement, status }),
    { onSuccess: () => qc.invalidateQueries(['rca', caseId]) },
  );

  // CAPA add/update
  const [capaType, setCapaType] = useState<'corrective' | 'preventive'>('corrective');
  const [capaDesc, setCapaDesc] = useState('');
  const [capaDue, setCapaDue] = useState('');
  const addCapaMut = useMutation(
    () => caseApi.addCapa(caseId, { action_type: capaType, description: capaDesc, due_at: capaDue || undefined }),
    { onSuccess: () => { qc.invalidateQueries(['capa', caseId]); setCapaDesc(''); setCapaDue(''); } },
  );
  const updCapaMut = useMutation(
    ({ aid, dto }: { aid: string; dto: any }) => caseApi.updateCapa(caseId, aid, dto),
    { onSuccess: () => qc.invalidateQueries(['capa', caseId]) },
  );

  return (
    <Box mt={1}>
      <Divider sx={{ mb: 2 }}><Chip label="Formal RCA (Level-2)" size="small" /></Divider>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Method</InputLabel>
            <Select value={method} label="Method" onChange={e => switchMethod(e.target.value)}>
              {METHODS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={8}>
          <TextField fullWidth size="small" label="Summary" value={summary} onChange={e => setSummary(e.target.value)} />
        </Grid>

        {/* Method-specific analysis */}
        {method === 'five_whys' && (
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">5 Whys</Typography>
            <Stack spacing={1} mt={0.5}>
              {(analysis.steps || []).map((s: any, i: number) => (
                <Box key={i} display="flex" gap={1} alignItems="center">
                  <Typography variant="caption" sx={{ width: 16 }}>{i + 1}</Typography>
                  <TextField size="small" label="Why?" value={s.why} sx={{ flex: 1 }}
                    onChange={e => setAnalysis((a: any) => ({ ...a, steps: a.steps.map((x: any, j: number) => j === i ? { ...x, why: e.target.value } : x) }))} />
                  <TextField size="small" label="Because…" value={s.because} sx={{ flex: 1.4 }}
                    onChange={e => setAnalysis((a: any) => ({ ...a, steps: a.steps.map((x: any, j: number) => j === i ? { ...x, because: e.target.value } : x) }))} />
                  <IconButton size="small" onClick={() => setAnalysis((a: any) => ({ ...a, steps: a.steps.filter((_: any, j: number) => j !== i) }))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAnalysis((a: any) => ({ ...a, steps: [...(a.steps || []), { why: '', because: '' }] }))}>Add why</Button>
            </Stack>
          </Grid>
        )}
        {method === 'fishbone' && (
          <Grid item xs={12}>
            <Grid container spacing={1}>
              {FISHBONE_CATS.map(cat => (
                <Grid item xs={12} sm={6} key={cat}>
                  <Paper variant="outlined" sx={{ p: 1 }}>
                    <Typography variant="caption" fontWeight={600} sx={{ textTransform: 'capitalize' }}>{cat}</Typography>
                    {(analysis[cat] || []).map((cause: string, i: number) => (
                      <Box key={i} display="flex" gap={0.5} mt={0.5}>
                        <TextField size="small" fullWidth value={cause}
                          onChange={e => setAnalysis((a: any) => ({ ...a, [cat]: a[cat].map((x: string, j: number) => j === i ? e.target.value : x) }))} />
                        <IconButton size="small" onClick={() => setAnalysis((a: any) => ({ ...a, [cat]: a[cat].filter((_: any, j: number) => j !== i) }))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Box>
                    ))}
                    <Button size="small" onClick={() => setAnalysis((a: any) => ({ ...a, [cat]: [...(a[cat] || []), ''] }))}>+ cause</Button>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Grid>
        )}
        {method === 'generic' && (
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={4} size="small" label="Findings / analysis"
              value={analysis.findings || ''} onChange={e => setAnalysis({ findings: e.target.value })} />
          </Grid>
        )}

        <Grid item xs={12}>
          <TextField fullWidth multiline rows={2} size="small" label="Root cause statement"
            value={statement} onChange={e => setStatement(e.target.value)} />
        </Grid>
        <Grid item xs={12} display="flex" justifyContent="space-between" alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Review status</InputLabel>
            <Select value={status} label="Review status" onChange={e => setStatus(e.target.value)}>
              {['draft', 'under_review', 'approved'].map(s => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" size="small" disabled={saveMut.isLoading} onClick={() => saveMut.mutate()}>
            {saveMut.isLoading ? 'Saving…' : 'Save RCA'}
          </Button>
        </Grid>
      </Grid>

      {/* CAPA */}
      <Divider sx={{ my: 2 }}><Chip label="CAPA — Corrective & Preventive Actions" size="small" /></Divider>
      {(['corrective', 'preventive'] as const).map(t => {
        const items = (capa as any[]).filter((a: any) => a.action_type === t);
        return (
          <Box key={t} mb={1.5}>
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'capitalize' }}>{t} actions</Typography>
            {items.length === 0 && <Typography variant="body2" color="text.secondary">None.</Typography>}
            {items.map((a: any) => {
              const overdue = a.due_at && new Date(a.due_at) < new Date() && !['done', 'verified', 'cancelled'].includes(a.status);
              return (
                <Box key={a.id} sx={{ py: 0.75, borderBottom: '1px solid #eee' }}>
                  <Typography variant="body2">{a.description}</Typography>
                  <Box display="flex" gap={1} alignItems="center" mt={0.5} flexWrap="wrap">
                    <FormControl size="small"><Select value={a.status} variant="standard"
                      onChange={e => updCapaMut.mutate({ aid: a.id, dto: { status: e.target.value } })}>
                      {CAPA_STATUS.map(s => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
                    </Select></FormControl>
                    <FormControl size="small"><Select value={a.effectiveness} variant="standard"
                      onChange={e => updCapaMut.mutate({ aid: a.id, dto: { effectiveness: e.target.value } })}>
                      {EFFECTIVENESS.map(s => <MenuItem key={s} value={s}>effectiveness: {s}</MenuItem>)}
                    </Select></FormControl>
                    {a.due_at && <Chip size="small" color={overdue ? 'error' : 'default'} label={`due ${new Date(a.due_at).toLocaleDateString()}`} sx={{ height: 20 }} />}
                    {a.effectiveness === 'effective' && <Chip size="small" color="success" label="effective" sx={{ height: 20 }} />}
                    {a.effectiveness === 'ineffective' && <Chip size="small" color="error" label="ineffective" sx={{ height: 20 }} />}
                  </Box>
                </Box>
              );
            })}
          </Box>
        );
      })}
      <Box display="flex" gap={1} alignItems="center" mt={1} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select value={capaType} onChange={e => setCapaType(e.target.value as any)}>
            <MenuItem value="corrective">Corrective</MenuItem>
            <MenuItem value="preventive">Preventive</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label="New action" value={capaDesc} onChange={e => setCapaDesc(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
        <TextField size="small" type="date" value={capaDue} onChange={e => setCapaDue(e.target.value)} InputLabelProps={{ shrink: true }} label="Due" />
        <Button variant="outlined" size="small" disabled={!capaDesc || addCapaMut.isLoading} onClick={() => addCapaMut.mutate()}>Add</Button>
      </Box>
    </Box>
  );
}
