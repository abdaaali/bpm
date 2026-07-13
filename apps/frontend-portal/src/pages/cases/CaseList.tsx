import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, TextField, MenuItem, Select,
  FormControl, InputLabel, Chip, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import { caseApi } from '../../api/client';
import { caseNextAction } from '../../lib/nextAction';
import NextActionButton from '../../components/NextActionButton';
import { format } from 'date-fns';
import { CASE_DOMAINS, domainForType, typeKeysForDomain, labelForType } from '../../config/caseDomains';
import { CASE_TYPE_COLORS as TYPE_COLORS, CASE_PRIORITY_COLORS as PRIORITY_COLORS, CASE_STATUS_COLORS as STATUS_COLORS } from '../../utils/statusColors';
import BackButton from '../../components/BackButton';
import DataTable, { DataTableColumn } from '../../components/DataTable';
import EmptyState from '../../components/EmptyState';

export default function CaseList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // List filters
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  // Type scope is driven by the URL: an explicit ?type= (one case type), else a
  // ?domain= (the Service/Security/Field group → that domain's types), else all.
  const domainKey = searchParams.get('domain') || domainForType(searchParams.get('type'));
  const typeKey = searchParams.get('type') || '';
  const effectiveType = typeKey || (domainKey ? typeKeysForDomain(domainKey).join(',') : '');
  const heading = typeKey ? labelForType(typeKey)
    : domainKey && CASE_DOMAINS[domainKey] ? CASE_DOMAINS[domainKey].label
    : 'Cases';

  // Debounce search — avoid API call on every keystroke
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Keep search in sync with the URL (the header global search navigates here).
  React.useEffect(() => { const s = searchParams.get('search'); if (s !== null) setSearch(s); }, [searchParams]);

  // Reset to page 0 whenever filters change
  React.useEffect(() => { setPage(0); }, [debouncedSearch, effectiveType, status, priority]);

  // Cases list
  const { data, isLoading } = useQuery(
    ['cases', page, debouncedSearch, effectiveType, status, priority],
    () => caseApi.list({ search: debouncedSearch, type: effectiveType, status, priority }, page + 1, pageSize),
    { keepPreviousData: true },
  );

  const columns: DataTableColumn<any>[] = [
    { key: 'number', label: 'Number', render: c => <Typography variant="body2" fontWeight={600} color="primary">{c.case_number}</Typography> },
    { key: 'title', label: 'Title', render: c => (
      <Box display="flex" alignItems="center" gap={0.75} sx={{ maxWidth: 300 }}>
        <Typography variant="body2" noWrap>{c.title}</Typography>
        {c.major_incident && <Chip label="MAJOR" size="small" color="error" sx={{ height: 18, fontWeight: 800 }} />}
        {c.breached
          ? <Chip label="SLA" size="small" color="error" variant="outlined" sx={{ height: 18 }} />
          : c.sla_at_risk && <Chip label="At Risk" size="small" color="warning" variant="outlined" sx={{ height: 18 }} />}
      </Box>
    ) },
    { key: 'type', label: 'Type', render: c => <Chip label={c.type} size="small" color={TYPE_COLORS[c.type] || 'default'} /> },
    { key: 'status', label: 'Status', render: c => <Chip label={c.status.replace(/_/g, ' ')} size="small" color={STATUS_COLORS[c.status] || 'default'} /> },
    { key: 'priority', label: 'Priority', render: c => <Chip label={c.priority} size="small" color={PRIORITY_COLORS[c.priority] || 'default'} /> },
    { key: 'requester', label: 'Requester', render: c => <>{c.requester_name || '—'}</> },
    { key: 'assignee', label: 'Assignee', render: c => <>{c.assignee_name || 'Unassigned'}</> },
    { key: 'created', label: 'Created', render: c => <>{format(new Date(c.created_at), 'dd MMM yyyy')}</> },
    { key: 'nextAction', label: 'Next Action', align: 'right', render: c => <NextActionButton action={caseNextAction(c)} /> },
  ];

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">{heading}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/cases/new')}>
          New Case
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Search cases…" value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }} />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select value={status} label="Status" onChange={e => setStatus(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {['new','open','in_progress','pending','pending_approval','resolved','closed','cancelled'].map(s =>
                <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Priority</InputLabel>
            <Select value={priority} label="Priority" onChange={e => setPriority(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {['critical','high','medium','low'].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={data?.data || []}
          rowKey={c => c.id}
          onRowClick={c => navigate(`/cases/${c.id}`)}
          loading={isLoading}
          emptyState={<EmptyState icon={<InboxIcon fontSize="inherit" />} title="No cases found" description="Try a different filter, or create a new case." />}
          page={page}
          pageSize={pageSize}
          total={data?.total || 0}
          onPageChange={setPage}
        />
      </Card>
    </Box>
  );
}
