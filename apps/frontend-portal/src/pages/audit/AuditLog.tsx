import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  Box, Typography, Card, CardContent,
  TextField, Chip, InputAdornment, MenuItem, Select,
  FormControl, InputLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import { auditApi } from '../../api/client';
import { format } from 'date-fns';
import DataTable, { DataTableColumn } from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';

const ENTITY_COLORS: Record<string, any> = {
  case: 'error', task: 'warning', process_instance: 'info',
  approval_instance: 'secondary', connector: 'default', process_definition: 'primary',
};

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');

  const { data, isLoading } = useQuery(
    ['audit', page, entityType, action, actorId],
    () => auditApi.list({ entityType, action, actorId }, page + 1, 50),
    { keepPreviousData: true },
  );

  const columns: DataTableColumn<any>[] = [
    { key: 'time', label: 'Time', render: log => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{format(new Date(log.created_at), 'dd MMM HH:mm:ss')}</Typography> },
    { key: 'entityType', label: 'Entity Type', render: log => <Chip label={log.entity_type} size="small" color={ENTITY_COLORS[log.entity_type] || 'default'} /> },
    { key: 'entityId', label: 'Entity ID', render: log => <Typography variant="body2" fontFamily="monospace" fontSize={11}>{log.entity_id?.slice(0, 12)}…</Typography> },
    { key: 'action', label: 'Action', render: log => <Chip label={log.action} size="small" variant="outlined" /> },
    { key: 'actor', label: 'Actor', render: log => <Typography variant="body2" fontFamily="monospace" fontSize={11}>{log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'system'}</Typography> },
  ];

  return (
    <Box>
      <Typography variant="h4" mb={3}>Audit Log</Typography>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Entity Type</InputLabel>
            <Select value={entityType} label="Entity Type" onChange={e => { setEntityType(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              {['case','task','process_instance','process_definition','approval_instance','approval_policy','connector','user','org_unit'].map(t =>
                <MenuItem key={t} value={t}>{t}</MenuItem>
              )}
            </Select>
          </FormControl>
          <TextField size="small" label="Action" value={action} onChange={e => { setAction(e.target.value); setPage(0); }}
            placeholder="e.g. created, approved" sx={{ minWidth: 160 }} />
          <TextField size="small" label="Actor ID" value={actorId} onChange={e => { setActorId(e.target.value); setPage(0); }}
            placeholder="User UUID" sx={{ minWidth: 220 }} />
        </CardContent>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={data?.data || []}
          rowKey={log => log.id}
          loading={isLoading}
          emptyState={<EmptyState icon={<HistoryIcon fontSize="inherit" />} title="No audit logs found" description="Try a different filter." />}
          page={page}
          pageSize={50}
          total={data?.total || 0}
          onPageChange={setPage}
        />
      </Card>
    </Box>
  );
}
