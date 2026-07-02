/**
 * SLA Policies — configure the SLA targets (response / resolve / restore hours
 * by case type × priority) and the SLA-class multipliers. Values shown are the
 * effective config (code default unless overridden); saving persists a per-tenant
 * override that applies to NEW cases (past cases keep their pinned snapshot).
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow,
  TableCell, TextField, Button, Chip, CircularProgress, Snackbar, Divider,
} from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';
import { slaApi } from '../../api/client';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];
const PRIORITY_COLOR: Record<string, any> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };

function num(v: any) { return v === '' || v == null ? '' : String(v); }

export default function SlaPolicies() {
  const qc = useQueryClient();
  const { data: targets = [], isLoading } = useQuery('sla-targets', slaApi.getTargets);
  const { data: factors = [] } = useQuery('sla-factors', slaApi.getClassFactors);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [fEdits, setFEdits] = useState<Record<string, any>>({});
  const [snack, setSnack] = useState('');

  const key = (t: any) => `${t.type}|${t.priority}`;
  const cell = (t: any, f: string) => edits[key(t)]?.[f] ?? num((t as any)[f]);
  const setCell = (t: any, f: string, v: string) =>
    setEdits(e => ({ ...e, [key(t)]: { ...(e[key(t)] || {}), [f]: v } }));

  const saveTarget = useMutation(
    (t: any) => {
      const e = edits[key(t)] || {};
      return slaApi.updateTarget(t.type, t.priority, {
        response_hours: e.response_hours ?? t.response_hours,
        resolve_hours:  e.resolve_hours  ?? t.resolve_hours,
        restore_hours:  (e.restore_hours ?? num(t.restore_hours)) === '' ? null : (e.restore_hours ?? t.restore_hours),
      });
    },
    {
      onSuccess: (_d, t) => { setEdits(e => { const n = { ...e }; delete n[key(t)]; return n; }); qc.invalidateQueries('sla-targets'); setSnack('Saved'); },
      onError: (e: any) => setSnack(e?.response?.data?.message || 'Save failed'),
    },
  );

  const saveFactor = useMutation(
    (f: any) => slaApi.updateClassFactor(f.class_key, { factor: fEdits[f.class_key] ?? f.factor }),
    {
      onSuccess: (_d, f) => { setFEdits(e => { const n = { ...e }; delete n[f.class_key]; return n; }); qc.invalidateQueries('sla-factors'); setSnack('Saved'); },
      onError: (e: any) => setSnack(e?.response?.data?.message || 'Save failed'),
    },
  );

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;

  // Group targets by type, ordered by priority.
  const byType: Record<string, any[]> = {};
  for (const t of targets as any[]) (byType[t.type] = byType[t.type] || []).push(t);
  const types = Object.keys(byType).sort();
  for (const ty of types) byType[ty].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const numField = (t: any, f: string) => (
    <TextField type="number" size="small" value={cell(t, f)} onChange={e => setCell(t, f, e.target.value)}
      sx={{ width: 90 }} inputProps={{ step: 'any', min: 0 }} />
  );

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <TimerIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>SLA Policies</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Response / resolve / restore targets per case type and priority, and the SLA-class multipliers.
        Edits apply to new cases; existing cases keep the SLA snapshotted at creation. Travel allowances
        are configured per site in the DataHub.
      </Typography>

      {/* Class factors */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" mb={0.5}>SLA-class multipliers</Typography>
          <Typography variant="caption" color="text.secondary">A factor below 1 tightens the targets (e.g. 0.75 = 25% faster); above 1 loosens them.</Typography>
          <Table size="small" sx={{ mt: 1, maxWidth: 520 }}>
            <TableHead><TableRow><TableCell>Class</TableCell><TableCell>Factor</TableCell><TableCell /><TableCell /></TableRow></TableHead>
            <TableBody>
              {(factors as any[]).map((f: any) => (
                <TableRow key={f.class_key} hover>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{f.class_key}</TableCell>
                  <TableCell>
                    <TextField type="number" size="small" value={fEdits[f.class_key] ?? num(f.factor)}
                      onChange={e => setFEdits(s => ({ ...s, [f.class_key]: e.target.value }))}
                      sx={{ width: 100 }} inputProps={{ step: '0.05', min: 0 }} />
                  </TableCell>
                  <TableCell>{f.overridden ? <Chip size="small" label="custom" color="primary" variant="outlined" /> : <Chip size="small" label="default" />}</TableCell>
                  <TableCell><Button size="small" disabled={saveFactor.isLoading} onClick={() => saveFactor.mutate(f)}>Save</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Targets matrix */}
      <Card>
        <CardContent>
          <Typography variant="h6" mb={1.5}>Targets (hours)</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell><TableCell>Priority</TableCell>
                <TableCell>Response</TableCell><TableCell>Resolve</TableCell><TableCell>Restore</TableCell>
                <TableCell /><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {types.map(ty => byType[ty].map((t, i) => (
                <TableRow key={key(t)} hover>
                  <TableCell sx={{ textTransform: 'capitalize', fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'text.primary' : 'text.disabled' }}>
                    {i === 0 ? ty.replace(/_/g, ' ') : ''}
                  </TableCell>
                  <TableCell><Chip size="small" label={t.priority} color={PRIORITY_COLOR[t.priority] || 'default'} variant="outlined" /></TableCell>
                  <TableCell>{numField(t, 'response_hours')}</TableCell>
                  <TableCell>{numField(t, 'resolve_hours')}</TableCell>
                  <TableCell>{numField(t, 'restore_hours')}</TableCell>
                  <TableCell>{t.overridden ? <Chip size="small" label="custom" color="primary" variant="outlined" /> : null}</TableCell>
                  <TableCell align="right">
                    <Button size="small" disabled={!edits[key(t)] || saveTarget.isLoading} onClick={() => saveTarget.mutate(t)}>Save</Button>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
