import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Chip, TablePagination, CircularProgress, InputAdornment, MenuItem, Select,
  FormControl, InputLabel,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { auditApi } from '../../api/client';
import { format } from 'date-fns';

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
        {isLoading ? (
          <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Entity Type</TableCell>
                  <TableCell>Entity ID</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Actor</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.data?.map((log: any) => (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {format(new Date(log.created_at), 'dd MMM HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Chip label={log.entity_type} size="small" color={ENTITY_COLORS[log.entity_type] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize={11}>
                        {log.entity_id?.slice(0, 12)}…
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={log.action} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize={11}>
                        {log.actor_id ? `${log.actor_id.slice(0, 8)}…` : 'system'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.data?.length && (
                  <TableRow><TableCell colSpan={5} align="center">No audit logs found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div" count={data?.total || 0} page={page} rowsPerPage={50}
              onPageChange={(_, p) => setPage(p)} rowsPerPageOptions={[50]}
            />
          </>
        )}
      </Card>
    </Box>
  );
}
