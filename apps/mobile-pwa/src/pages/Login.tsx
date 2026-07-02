import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, TextField, Button, Alert, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuth } from '../auth';
import { getConn, MODES } from '../connection';

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const conn = getConn();
  const meta = MODES.find((m) => m.mode === conn?.mode);
  const [u, setU] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!conn) { nav('/connect'); return null; }
  const submit = async () => {
    setBusy(true); setErr('');
    try { await login(u, p); nav('/'); }
    catch (e: any) { setErr(e?.response?.data?.message || e?.response?.data?.error_description || 'Sign-in failed'); }
    finally { setBusy(false); }
  };
  return (
    <Box sx={{ minHeight: '100dvh', p: 3, display: 'flex', flexDirection: 'column' }}>
      <IconButton sx={{ alignSelf: 'flex-start' }} onClick={() => nav('/connect')}><ArrowBackIcon /></IconButton>
      <Box sx={{ pt: 2, mb: 3 }}>
        <Typography variant="overline" sx={{ color: meta?.color }}>{meta?.title}</Typography>
        <Typography variant="h5" fontWeight={800}>Sign in</Typography>
      </Box>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      <TextField fullWidth label={conn.mode === 'bpm' ? 'Username' : 'Email'} value={u} onChange={(e) => setU(e.target.value)} sx={{ mb: 2 }} autoCapitalize="none" />
      <TextField fullWidth label="Password" type="password" value={p} onChange={(e) => setP(e.target.value)} sx={{ mb: 3 }}
        onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <Button fullWidth size="large" variant="contained" disabled={busy || !u || !p} onClick={submit}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </Box>
  );
}
