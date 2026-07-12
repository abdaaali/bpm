import React from 'react';
import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function DetailPanel({
  open, onClose, title, width = 480, children,
}: { open: boolean; onClose: () => void; title: string; width?: number; children: React.ReactNode }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6">{title}</Typography>
        <IconButton size="small" onClick={onClose} aria-label={`Close ${title}`}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>{children}</Box>
    </Drawer>
  );
}
