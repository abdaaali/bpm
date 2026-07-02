import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, IconButton, Typography, Card, CardContent, Chip, Button, Stack, CircularProgress, Snackbar, TextField } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api } from '../api';

export default function WorkOrderDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const [w, setW] = useState<any>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [note, setNote] = useState('');
  const load = () => api.get(`/work-orders/${id}`).then((r) => setW(r.data)).catch(() => setMsg('Failed to load'));
  useEffect(() => { load(); }, [id]);
  const act = async (path: string, body: any = {}) => {
    setBusy(true);
    try { await api.post(`/work-orders/${id}/${path}`, body); setMsg('Done'); setNote(''); load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Action failed'); } finally { setBusy(false); }
  };
  if (!w) return <Box sx={{ textAlign: 'center', mt: 6 }}><CircularProgress /></Box>;
  const st = String(w.status || '').toLowerCase();
  return (
    <Box sx={{ pb: 4 }}>
      <AppBar position="sticky" sx={{ bgcolor: '#2e7d32' }}><Toolbar variant="dense"><IconButton color="inherit" edge="start" onClick={() => nav(-1)}><ArrowBackIcon /></IconButton>
        <Typography variant="h6">{w.work_order_number || 'Work Order'}</Typography></Toolbar></AppBar>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>{w.title || w.description}</Typography>
        <Chip label={st.replace(/_/g, ' ') || 'open'} size="small" sx={{ mb: 2 }} />
        <Card sx={{ mb: 2 }}><CardContent>
          {w.site && <><Typography variant="body2" color="text.secondary">Site</Typography><Typography gutterBottom>{w.site}</Typography></>}
          {w.scheduled_at && <><Typography variant="body2" color="text.secondary">Scheduled</Typography><Typography gutterBottom>{new Date(w.scheduled_at).toLocaleString()}</Typography></>}
          {w.description && <><Typography variant="body2" color="text.secondary">Details</Typography><Typography variant="body2">{w.description}</Typography></>}
        </CardContent></Card>
        <TextField fullWidth size="small" label="Progress note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 1 }} multiline rows={2} />
        <Stack spacing={1}>
          {['assigned', 'pending', 'new', ''].includes(st) && <Button fullWidth variant="outlined" disabled={busy} onClick={() => act('accept')}>Accept</Button>}
          <Button fullWidth variant="outlined" disabled={busy || !note} onClick={() => act('progress', { note })}>Submit progress</Button>
          <Button fullWidth variant="contained" color="success" disabled={busy} onClick={() => act('complete', { notes: note || 'Completed from mobile' })}>Complete</Button>
        </Stack>
      </Box>
      <Snackbar open={!!msg} autoHideDuration={2500} onClose={() => setMsg('')} message={msg} />
    </Box>
  );
}
