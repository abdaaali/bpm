/**
 * CaseWorkTable — a compact list of cases for the Workplace ("To Do" and
 * "Team Queue"). Every row is a case and navigates to /cases/:id, where the
 * full work surface (incl. the process Next Step) lives. Team Queue passes
 * onClaim to show a Claim button; To Do omits it.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Button, Tooltip,
} from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_COLOR: Record<string, any> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};
const STATUS_COLOR: Record<string, any> = {
  new: 'info', open: 'primary', in_progress: 'primary', pending: 'warning',
  pending_approval: 'warning', dispatched_external: 'secondary',
};

function slaCell(c: any) {
  if (c.breached) return <Chip size="small" color="error" label="SLA breached" />;
  if (c.sla_at_risk) return <Chip size="small" color="warning" variant="outlined" label="At risk" />;
  if (c.sla_due_at) {
    return (
      <Typography variant="caption" color="text.secondary">
        due {formatDistanceToNow(new Date(c.sla_due_at), { addSuffix: true })}
      </Typography>
    );
  }
  return <Typography variant="caption" color="text.secondary">—</Typography>;
}

export default function CaseWorkTable({
  cases,
  emptyText,
  onClaim,
  claiming,
}: {
  cases: any[];
  emptyText: string;
  onClaim?: (c: any) => void;
  claiming?: boolean;
}) {
  const navigate = useNavigate();

  if (!cases.length) {
    return <Box py={5} textAlign="center"><Typography color="text.secondary">{emptyText}</Typography></Box>;
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Reference</TableCell>
          <TableCell>Title</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Priority</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>SLA</TableCell>
          {onClaim ? <TableCell>Team</TableCell> : null}
          <TableCell align="right" />
        </TableRow>
      </TableHead>
      <TableBody>
        {cases.map((c: any) => (
          <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${c.id}`)}>
            <TableCell>
              <Typography variant="body2" fontWeight={600} color="primary" fontFamily="monospace">
                {c.case_number}
              </Typography>
            </TableCell>
            <TableCell sx={{ maxWidth: 280 }}>
              <Typography variant="body2" noWrap>{c.title || '—'}</Typography>
            </TableCell>
            <TableCell><Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{(c.type || '').replace('_', ' ')}</Typography></TableCell>
            <TableCell><Chip size="small" label={c.priority} color={PRIORITY_COLOR[c.priority] || 'default'} variant="outlined" /></TableCell>
            <TableCell><Chip size="small" label={(c.status || '').replace('_', ' ')} color={STATUS_COLOR[c.status] || 'default'} /></TableCell>
            <TableCell>{slaCell(c)}</TableCell>
            {onClaim ? <TableCell><Typography variant="caption" color="text.secondary">{c.team_name || '—'}</Typography></TableCell> : null}
            <TableCell align="right" onClick={e => e.stopPropagation()}>
              {onClaim ? (
                <Tooltip title="Claim this case">
                  <span>
                    <Button size="small" startIcon={<AssignmentIndIcon />} disabled={claiming}
                      onClick={() => onClaim(c)}>Claim</Button>
                  </span>
                </Tooltip>
              ) : (
                <Button size="small" onClick={() => navigate(`/cases/${c.id}`)}>Open</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
