import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from './BackButton';

export default function PageHeader({
  backTo, backLabel, title, icon, subtitle, chips, actions,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <BackButton to={backTo} label={backLabel} sx={{ mb: 1 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {icon}
            <Typography variant="h4" noWrap>{title}</Typography>
            {chips}
          </Box>
          {subtitle}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
