import React from 'react';
import { Box, Typography } from '@mui/material';

export default function TaskCard({
  title, meta, statusChip, dueChip, onClick,
}: { title: string; meta: string; statusChip?: React.ReactNode; dueChip?: React.ReactNode; onClick?: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5,
        border: '1px solid', borderColor: 'divider', borderRadius: '10px', mb: 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 160ms ease, background-color 160ms ease',
        '&:hover': onClick ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : undefined,
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{title}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{meta}</Typography>
      </Box>
      {statusChip}
      {dueChip}
    </Box>
  );
}
