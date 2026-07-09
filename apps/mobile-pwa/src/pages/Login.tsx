import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, TextField, Button, Alert, IconButton, Avatar, Card } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import EngineeringIcon from '@mui/icons-material/Engineering';
import { useAuth } from '../auth';
import { getConn, MODES } from '../connection';

const MODE_ICON: Record<string, React.ReactNode> = {
  bpm: <AccountTreeIcon sx={{ fontSize: 30 }} />,
  contractor: <EngineeringIcon sx={{ fontSize: 30 }} />,
};

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
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Hero — mode-colored gradient banner, distinct per mode (blue for BPM, orange for Contractor). */}
      <Box data-testid="login-hero" sx={{
        background: meta?.gradient, color: '#fff', pt: 2, pb: 10, px: 2,
        borderBottomLeftRadius: 36, borderBottomRightRadius: 36,
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 12px 32px ${meta?.color}66`,
      }}>
        {/* Decorative glow — abstract only, reinforces depth without an illustration asset. */}
        <Box sx={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.10)' }} />
        <IconButton sx={{
          color: '#fff', bgcolor: 'rgba(255,255,255,0.14)', transition: 'background-color 180ms ease, transform 180ms ease',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.24)' }, '&:active': { transform: 'scale(0.93)' },
        }} onClick={() => nav('/connect')}><ArrowBackIcon /></IconButton>
        <Box sx={{ textAlign: 'center', pb: 1, position: 'relative' }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.35)', width: 68, height: 68, mx: 'auto', mb: 2 }}>
            {meta ? MODE_ICON[meta.mode] : null}
          </Avatar>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 1.6, opacity: 0.95 }}>{meta?.title}</Typography>
          <Typography variant="h4" fontWeight={800} letterSpacing={-0.5}>Welcome back</Typography>
        </Box>
      </Box>

      {/* Form — floats up over the hero's rounded bottom edge for a layered, premium feel. */}
      <Box sx={{ px: 2.5, mt: -6, flex: 1, position: 'relative' }}>
        <Card sx={{ p: 3.5, borderRadius: '32px', boxShadow: '0 20px 44px rgba(15,23,42,0.18)' }}>
          <Typography variant="h6" fontWeight={800} sx={{ mb: 2.5 }}>Sign in</Typography>
          {err && <Alert severity="error" sx={{ mb: 2.5, borderRadius: '16px' }}>{err}</Alert>}
          <TextField fullWidth label={conn.mode === 'bpm' ? 'Username' : 'Email'} value={u} onChange={(e) => setU(e.target.value)} sx={{ mb: 2.5 }} autoCapitalize="none" />
          <TextField fullWidth label="Password" type="password" value={p} onChange={(e) => setP(e.target.value)} sx={{ mb: 3.5 }}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <Button fullWidth size="large" variant="contained" disabled={busy || !u || !p} onClick={submit}
            sx={{
              bgcolor: meta?.color, fontSize: '1.05rem', py: 1.6,
              boxShadow: `0 10px 24px ${meta?.color}55`,
              '&:hover': { bgcolor: meta?.color, filter: 'brightness(0.92)', boxShadow: `0 12px 28px ${meta?.color}70` },
            }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Card>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3.5, pb: 2 }}>BPM Portal</Typography>
      </Box>
    </Box>
  );
}
