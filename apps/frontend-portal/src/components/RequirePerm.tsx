/**
 * RequirePerm — route guard that renders children only if the signed-in user
 * holds the given permission; otherwise redirects (default /home). UI gating is
 * defense-in-depth — the gateway still enforces the real guarantee.
 *
 * Used to keep the BPMN diagram / Process Monitor / process analytics a
 * designer-only concern (perm `processes:read`), so end users never land on the
 * process-engineering surfaces.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAccess } from '../auth/useAccess';

export default function RequirePerm({
  perm,
  redirectTo = '/home',
  children,
}: {
  perm: string;
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const { can, me } = useAccess();
  // me is undefined until the /me query resolves — avoid a flash-redirect.
  if (me === undefined) {
    return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  }
  if (!can(perm)) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
