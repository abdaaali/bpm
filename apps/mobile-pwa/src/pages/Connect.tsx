import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Card, CardActionArea, Stack, Chip, Avatar } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import EngineeringIcon from '@mui/icons-material/Engineering';
import { MODES, setConn, Mode } from '../connection';
import { clickableCardSx } from '../components/ui';

const MODE_ICON: Record<Mode, React.ReactNode> = {
  bpm: <AccountTreeIcon sx={{ fontSize: 26 }} />,
  contractor: <EngineeringIcon sx={{ fontSize: 26 }} />,
};

export default function Connect() {
  const nav = useNavigate();
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', position: 'relative', overflow: 'hidden' }}>
      {/* Soft abstract backdrop — decorative only, no illustration assets. */}
      <Box sx={{
        position: 'absolute', top: -110, right: -80, width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(21,101,192,0.16) 0%, rgba(239,108,0,0.11) 100%)',
      }} />
      <Box sx={{
        position: 'absolute', top: 200, left: -110, width: 240, height: 240, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(239,108,0,0.09) 0%, rgba(21,101,192,0.07) 100%)',
      }} />

      <Box sx={{ position: 'relative', p: 3, pt: 7, textAlign: 'center', mb: 4 }}>
        <Box component="img" src="/icon.svg" alt=""
          sx={{ width: 84, height: 84, borderRadius: 4, mb: 2.5, boxShadow: '0 14px 32px rgba(13,71,161,0.32)' }} />
        <Typography variant="h4" fontWeight={800} letterSpacing={-0.5}>BPM Field</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>Choose what you'd like to connect to</Typography>
      </Box>

      <Box sx={{ position: 'relative', px: 3, flex: 1 }}>
        <Stack spacing={2}>
          {MODES.map((m) => (
            <Card key={m.mode} sx={{
              ...clickableCardSx,
              overflow: 'hidden',
              background: `linear-gradient(90deg, ${m.color}17 0%, #ffffff 55%)`,
            }}>
              <CardActionArea sx={{ p: 2.75, display: 'flex', alignItems: 'center', gap: 2.25, position: 'relative' }}
                onClick={() => { setConn({ mode: m.mode, server: '' }); nav('/login'); }}>
                <Box sx={{ position: 'absolute', inset: 0, left: 'auto', width: 6, background: m.gradient }} />
                <Avatar sx={{ background: m.gradient, width: 54, height: 54, boxShadow: `0 6px 16px ${m.color}55` }}>
                  {MODE_ICON[m.mode]}
                </Avatar>
                <Box flex={1} minWidth={0}>
                  <Typography variant="subtitle1" fontWeight={800} fontSize="1.08rem">{m.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{m.subtitle}</Typography>
                </Box>
                <ChevronRightIcon sx={{ color: m.color, fontSize: 28 }} />
              </CardActionArea>
            </Card>
          ))}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block', textAlign: 'center' }}>
          Installable — add to your home screen for a full-screen app.
        </Typography>
      </Box>
      <Chip label="BPM Portal · PWA" size="small" variant="outlined" sx={{ alignSelf: 'center', mb: 3, color: 'text.secondary' }} />
    </Box>
  );
}
