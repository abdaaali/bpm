/**
 * TeamQueue — the Workplace "Team Queue" tab: unclaimed cases in the user's
 * team(s) that they can pick up (from /cases/my-work, mine=false). Claiming
 * assigns the case to the user and opens it; the row then moves to "To Do".
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Box, Card, CardContent, Typography, CircularProgress, Snackbar, Alert } from '@mui/material';
import { caseApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import CaseWorkTable from './CaseWorkTable';

export default function TeamQueue() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [toast, setToast] = useState('');

  const { data: myWork = [], isLoading } = useQuery('my-work', caseApi.getMyWork);
  const teamCases = (myWork as any[]).filter(c => !c.mine);

  const claim = useMutation(
    async (c: any) => {
      // POST /cases/:id/claim is the purpose-built endpoint: it verifies the
      // caller is actually a member of the case's team (see case.service.ts
      // claimCase()) — the generic assign() endpoint used here previously had
      // no such check and required a permission (cases:assign) that
      // field_engineer/security/logistics don't hold, so this button 403'd
      // for exactly the roles who should be using it.
      await caseApi.claim(c.id);
      if (c.status === 'new') await caseApi.transition(c.id, { status: 'open' });
    },
    {
      onSuccess: () => { qc.invalidateQueries('my-work'); setToast('Case claimed and assigned to you'); },
      onError: (e: any) => setToast(e?.response?.data?.message || 'Could not claim — you may not be on this team'),
    },
  );

  if (isLoading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  return (
    <Box>
      <Card variant="outlined">
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6" mb={0.5}>Team Queue ({teamCases.length})</Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Unclaimed cases in your team(s). Claim one to start working it.
          </Typography>
        </CardContent>
        <CaseWorkTable
          cases={teamCases}
          emptyText="No unclaimed work in your teams."
          onClaim={c => claim.mutate(c)}
          claiming={claim.isLoading}
        />
      </Card>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')}>
        <Alert severity="info" onClose={() => setToast('')}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
}
