import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardActionArea, TextField, Button, Stack, Chip } from '@mui/material';
import { MODES, setConn, getConn } from '../connection';

export default function Connect() {
  const nav = useNavigate();
  const existing = getConn();
  const [server, setServer] = useState(existing?.server || '');
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#f4f6fb', p: 3, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ pt: 4, textAlign: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={800}>BPM Field</Typography>
        <Typography variant="body2" color="text.secondary">Choose what to connect to</Typography>
      </Box>
      <Stack spacing={2}>
        {MODES.map((m) => (
          <Card key={m.mode} sx={{ borderLeft: `6px solid ${m.color}` }}>
            <CardActionArea sx={{ p: 2.5 }} onClick={() => { setConn({ mode: m.mode, server: server.replace(/\/$/, '') }); nav('/login'); }}>
              <Typography variant="h6" fontWeight={700}>{m.title}</Typography>
              <Typography variant="body2" color="text.secondary">{m.subtitle}</Typography>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
      <Box sx={{ mt: 4 }}>
        <TextField fullWidth size="small" label="Server (optional — blank = this host)" placeholder="https://bpm.example.com"
          value={server} onChange={(e) => setServer(e.target.value)} />
        <Typography variant="caption" color="text.secondary">Installable: add to home screen for a full-screen app.</Typography>
      </Box>
      <Box flex={1} />
      <Chip label="PWA" size="small" sx={{ alignSelf: 'center', mt: 2 }} />
    </Box>
  );
}
