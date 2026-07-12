import React from 'react';
import { Box, Typography } from '@mui/material';

export default function EmptyState({
  icon, title, description, action,
}: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary' }}>
      <Box sx={{ fontSize: 40, mb: 1.5, opacity: 0.4, display: 'flex', justifyContent: 'center' }}>{icon}</Box>
      <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', mb: description ? 0.5 : 2 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ mb: 2 }}>{description}</Typography>}
      {action}
    </Box>
  );
}
