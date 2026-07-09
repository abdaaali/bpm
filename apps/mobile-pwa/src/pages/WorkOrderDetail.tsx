import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, IconButton, Typography, Card, CardContent, Button, Stack, Snackbar, TextField, Divider } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlaceIcon from '@mui/icons-material/Place';
import EventIcon from '@mui/icons-material/Event';
import { api } from '../api';
import { getConn, MODES } from '../connection';
import { StatusChip, LoadingState } from '../components/ui';

export default function WorkOrderDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const [w, setW] = useState<any>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [note, setNote] = useState('');
  // WorkOrderDetail is only reachable in contractor mode — read the brand
  // from the same MODES source of truth as Connect/Login instead of a
  // second hardcoded hex value.
  const meta = MODES.find((m) => m.mode === getConn()?.mode);
  const load = () => api.get(`/work-orders/${id}`).then((r) => setW(r.data)).catch(() => setMsg('Failed to load'));
  useEffect(() => { load(); }, [id]);
  const act = async (path: string, body: any = {}) => {
    setBusy(true);
    try { await api.post(`/work-orders/${id}/${path}`, body); setMsg('Done'); setNote(''); load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Action failed'); } finally { setBusy(false); }
  };
  if (!w) return <LoadingState label="Loading work order…" />;
  // Backend column is `assignment_status` (see work-orders.service.ts) -- there is no `status` field.
  const st = String(w.assignment_status || '').toLowerCase();
  return (
    <Box sx={{ pb: 4, minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0} sx={{ background: meta?.gradient }}>
        <Toolbar sx={{ minHeight: 60 }}>
          <IconButton color="inherit" edge="start" onClick={() => nav(-1)}
            sx={{ bgcolor: 'rgba(255,255,255,0.14)', mr: 1, transition: 'background-color 180ms ease', '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontSize: 18, fontWeight: 800 }}>{w.work_order_ref || 'Work Order'}</Typography>
        </Toolbar>
      </AppBar>

      {/* Colored sub-header — title + status live on-brand, mirrors the Login/Connect hero treatment. */}
      <Box sx={{ background: meta?.gradient, color: '#fff', px: 2.5, pt: 1, pb: 4, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 1.5 }}>{w.title || w.description}</Typography>
        <StatusChip value={st || 'open'} size="medium" />
      </Box>

      <Box sx={{ px: 2.5, mt: -2.5 }}>
        <Card sx={{ mb: 2.5, borderRadius: '24px' }}><CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2.5 }}>
          {w.site && (
            <Box display="flex" alignItems="flex-start" gap={1.25}>
              <PlaceIcon fontSize="small" sx={{ color: meta?.color, mt: 0.25 }} />
              <Box><Typography variant="caption" color="text.secondary">Site</Typography><Typography variant="body2" fontWeight={700}>{w.site}</Typography></Box>
            </Box>
          )}
          {w.scheduled_at && (
            <Box display="flex" alignItems="flex-start" gap={1.25}>
              <EventIcon fontSize="small" sx={{ color: meta?.color, mt: 0.25 }} />
              <Box><Typography variant="caption" color="text.secondary">Scheduled</Typography><Typography variant="body2" fontWeight={700}>{new Date(w.scheduled_at).toLocaleString()}</Typography></Box>
            </Box>
          )}
          {w.description && (<>
            <Divider />
            <Box><Typography variant="caption" color="text.secondary">Details</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>{w.description}</Typography></Box>
          </>)}
        </CardContent></Card>

        <Card sx={{ mb: 2.5, borderRadius: '24px' }}><CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5 }}>Update this work order</Typography>
          <TextField fullWidth size="small" label="Progress note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} multiline rows={2} />
          <Stack spacing={1.25}>
            {/* Backend only allows accept() from 'pending' (work-orders.service.ts:124) */}
            {st === 'pending' && (
              <Button fullWidth size="large" variant="outlined" disabled={busy} onClick={() => act('accept')}
                sx={{ borderColor: meta?.color, color: meta?.color }}>Accept</Button>
            )}
            <Button fullWidth size="large" variant="outlined" disabled={busy || !note} onClick={() => act('progress', { note })}
              sx={{ borderColor: meta?.color, color: meta?.color }}>Submit progress</Button>
            <Button fullWidth size="large" variant="contained" color="success" disabled={busy} onClick={() => act('complete', { notes: note || 'Completed from mobile' })}>
              Complete
            </Button>
          </Stack>
        </CardContent></Card>
      </Box>
      <Snackbar open={!!msg} autoHideDuration={2500} onClose={() => setMsg('')} message={msg} />
    </Box>
  );
}
