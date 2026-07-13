/**
 * CaseWorkTable — a compact list of cases for the Workplace ("To Do" and
 * "Team Queue"). Every row is a case and navigates to /cases/:id, where the
 * full work surface (incl. the process Next Step) lives. Team Queue passes
 * onClaim to show a Claim button; To Do omits it.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Button, Tooltip,
} from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { formatDistanceToNow } from 'date-fns';
import DataTable, { DataTableColumn } from '../../components/DataTable';

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

  const columns: DataTableColumn<any>[] = [
    { key: 'reference', label: 'Reference', render: c => (
      <Typography variant="body2" fontWeight={600} color="primary" fontFamily="monospace">{c.case_number}</Typography>
    ) },
    { key: 'title', label: 'Title', render: c => <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{c.title || '—'}</Typography> },
    { key: 'type', label: 'Type', render: c => <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{(c.type || '').replace('_', ' ')}</Typography> },
    { key: 'priority', label: 'Priority', render: c => <Chip size="small" label={c.priority} color={PRIORITY_COLOR[c.priority] || 'default'} variant="outlined" /> },
    { key: 'status', label: 'Status', render: c => <Chip size="small" label={(c.status || '').replace('_', ' ')} color={STATUS_COLOR[c.status] || 'default'} /> },
    { key: 'sla', label: 'SLA', render: c => slaCell(c) },
    ...(onClaim ? [{ key: 'team', label: 'Team', render: (c: any) => <Typography variant="caption" color="text.secondary">{c.team_name || '—'}</Typography> }] : []),
    { key: 'actions', label: '', align: 'right' as const, render: c => (
      onClaim ? (
        <Tooltip title="Claim this case">
          <span>
            <Button size="small" startIcon={<AssignmentIndIcon />} disabled={claiming}
              onClick={e => { e.stopPropagation(); onClaim(c); }}>Claim</Button>
          </span>
        </Tooltip>
      ) : (
        <Button size="small" onClick={e => { e.stopPropagation(); navigate(`/cases/${c.id}`); }}>Open</Button>
      )
    ) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={cases}
      rowKey={c => c.id}
      onRowClick={c => navigate(`/cases/${c.id}`)}
      emptyState={<Box py={5} textAlign="center"><Typography color="text.secondary">{emptyText}</Typography></Box>}
    />
  );
}
