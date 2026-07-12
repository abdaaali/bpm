import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from './BackButton';

export default function PageHeader({
  backTo, backLabel, title, chips, actions,
}: { backTo: string; backLabel: string; title: string; chips?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <BackButton to={backTo} label={backLabel} sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="h4" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>{title}</Typography>
        {chips}
        {actions && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
