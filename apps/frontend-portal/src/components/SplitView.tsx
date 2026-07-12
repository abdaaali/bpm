import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';

/** Camunda-Tasklist-style list+detail layout. Collapses to list-only (detail
 * shown via drill-in navigation, handled by the caller) below the `md` breakpoint. */
export default function SplitView({
  list, detail, listWidth = 380, showDetailOnMobile = false,
}: { list: React.ReactNode; detail: React.ReactNode; listWidth?: number; showDetailOnMobile?: boolean }) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'));

  if (isNarrow) {
    return <Box>{showDetailOnMobile ? detail : list}</Box>;
  }
  return (
    <Box sx={{ display: 'flex', gap: 2, height: '100%', minHeight: 0 }}>
      <Box sx={{ width: listWidth, flexShrink: 0, overflowY: 'auto' }}>{list}</Box>
      <Box sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto' }}>{detail}</Box>
    </Box>
  );
}
