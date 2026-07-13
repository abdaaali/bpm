import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, Grid, Button, IconButton, MenuItem,
  TextField, Select, FormControl, InputLabel, Autocomplete, Chip, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Paper,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip, Stack,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { reportApi } from '../../api/client';
import { toCsv, downloadCsv } from '../../lib/csv';
import BackButton from '../../components/BackButton';

interface ColumnMeta { key: string; label: string; type: string; filterable: boolean; sortable: boolean; }
interface SourceMeta { key: string; label: string; defaultColumns: string[]; columns: ColumnMeta[]; }
interface FilterRow { column: string; op: string; value: string; value2: string; }

const OPS_BY_TYPE: Record<string, { op: string; label: string; arity: 0 | 1 | 2 }[]> = {
  string: [
    { op: 'contains', label: 'contains', arity: 1 },
    { op: 'eq', label: 'equals', arity: 1 },
    { op: 'ne', label: 'not equals', arity: 1 },
    { op: 'in', label: 'in (comma list)', arity: 1 },
    { op: 'is_null', label: 'is empty', arity: 0 },
    { op: 'not_null', label: 'is not empty', arity: 0 },
  ],
  number: [
    { op: 'eq', label: '=', arity: 1 }, { op: 'ne', label: '≠', arity: 1 },
    { op: 'gt', label: '>', arity: 1 }, { op: 'gte', label: '≥', arity: 1 },
    { op: 'lt', label: '<', arity: 1 }, { op: 'lte', label: '≤', arity: 1 },
    { op: 'between', label: 'between', arity: 2 },
    { op: 'is_null', label: 'is empty', arity: 0 }, { op: 'not_null', label: 'is not empty', arity: 0 },
  ],
  date: [
    { op: 'gte', label: 'on/after', arity: 1 }, { op: 'lte', label: 'on/before', arity: 1 },
    { op: 'between', label: 'between', arity: 2 },
    { op: 'is_null', label: 'is empty', arity: 0 }, { op: 'not_null', label: 'is not empty', arity: 0 },
  ],
  bool: [
    { op: 'is_true', label: 'is true', arity: 0 },
    { op: 'is_false', label: 'is false', arity: 0 },
  ],
};

const inputType = (t: string) => (t === 'date' ? 'date' : t === 'number' ? 'number' : 'text');
const fmtCell = (v: any, type: string) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'date') { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString(); }
  if (type === 'bool') return v ? 'Yes' : 'No';
  return String(v);
};

export default function ReportBuilder() {
  const qc = useQueryClient();
  const [dataSource, setDataSource] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(500);
  const [result, setResult] = useState<{ columns: any[]; rows: any[] } | null>(null);
  const [error, setError] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');

  const { data: sources, isLoading: loadingSources } = useQuery<SourceMeta[]>('report-sources', reportApi.sources);
  const { data: templates } = useQuery<any[]>('report-templates', reportApi.listTemplates);

  const source = useMemo(() => sources?.find((s) => s.key === dataSource), [sources, dataSource]);
  const colMeta = (key: string) => source?.columns.find((c) => c.key === key);

  // Default to the first data source once metadata loads.
  useEffect(() => {
    if (!dataSource && sources?.length) applySource(sources[0].key, sources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  function applySource(key: string, src = sources) {
    const s = src?.find((x) => x.key === key);
    setDataSource(key);
    setColumns(s?.defaultColumns ?? []);
    setFilters([]);
    setSortCol('');
    setSortDir('desc');
    setResult(null);
    setActiveTemplateId('');
  }

  const runMutation = useMutation(
    () => reportApi.run({
      dataSource,
      columns,
      filters: filters
        .filter((f) => f.column && f.op)
        .map((f) => ({ column: f.column, op: f.op, value: f.value, value2: f.value2 })),
      sort: sortCol ? { column: sortCol, dir: sortDir } : undefined,
      limit,
    }),
    {
      onSuccess: (data) => { setResult(data); setError(''); },
      onError: (e: any) => setError(e.response?.data?.message || e.message || 'Report failed'),
    },
  );

  const addFilter = () => {
    const firstFilterable = source?.columns.find((c) => c.filterable);
    if (!firstFilterable) return;
    const op = OPS_BY_TYPE[firstFilterable.type]?.[0]?.op || 'eq';
    setFilters((f) => [...f, { column: firstFilterable.key, op, value: '', value2: '' }]);
  };
  const updateFilter = (i: number, patch: Partial<FilterRow>) =>
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));

  const loadTemplate = (id: string) => {
    setActiveTemplateId(id);
    if (!id) return;
    const t = templates?.find((x) => x.id === id);
    if (!t) return;
    const cfg = t.config || {};
    setDataSource(t.data_source);
    setColumns(cfg.columns ?? []);
    setFilters((cfg.filters ?? []).map((f: any) => ({ column: f.column, op: f.op, value: f.value ?? '', value2: f.value2 ?? '' })));
    setSortCol(cfg.sort?.column ?? '');
    setSortDir(cfg.sort?.dir === 'asc' ? 'asc' : 'desc');
    setLimit(cfg.limit ?? 500);
    setResult(null);
  };

  const currentConfig = () => ({
    columns,
    filters: filters.filter((f) => f.column && f.op),
    sort: sortCol ? { column: sortCol, dir: sortDir } : null,
    limit,
  });

  const saveMutation = useMutation(
    () => reportApi.saveTemplate({ name: saveName, description: saveDesc, dataSource, config: currentConfig() }),
    {
      onSuccess: () => { qc.invalidateQueries('report-templates'); setSaveOpen(false); setSaveName(''); setSaveDesc(''); },
      onError: (e: any) => setError(e.response?.data?.message || e.message),
    },
  );
  const updateTemplateMutation = useMutation(
    (id: string) => {
      const t = templates?.find((x) => x.id === id);
      return reportApi.updateTemplate(id, { name: t?.name, description: t?.description, dataSource, config: currentConfig() });
    },
    { onSuccess: () => qc.invalidateQueries('report-templates') },
  );
  const deleteTemplateMutation = useMutation((id: string) => reportApi.deleteTemplate(id), {
    onSuccess: () => { qc.invalidateQueries('report-templates'); setActiveTemplateId(''); },
  });

  const exportCsv = () => {
    if (!result?.rows?.length) return;
    const csv = toCsv(result.columns.map((c: any) => ({ key: c.key, label: c.label })), result.rows);
    const ds = source?.label?.replace(/\s+/g, '_').toLowerCase() || 'report';
    downloadCsv(csv, `${ds}_report_${new Date().toISOString().slice(0, 10)}`);
  };

  if (loadingSources) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Box display="flex" alignItems="center" gap={1.5} mb={1}>
        <AssessmentIcon color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" fontWeight={800}>Report Generator</Typography>
          <Typography variant="body2" color="text.secondary">
            Build a report from live data, export to CSV, and save the layout as a reusable template.
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2.5}>
        {/* ── Builder ── */}
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Saved Templates</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" fullWidth>
                  <Select
                    displayEmpty value={activeTemplateId}
                    onChange={(e) => loadTemplate(e.target.value)}
                  >
                    <MenuItem value=""><em>— New report —</em></MenuItem>
                    {(templates || []).map((t) => (
                      <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {activeTemplateId && (
                  <>
                    <Tooltip title="Overwrite this template with the current layout">
                      <span>
                        <IconButton size="small" onClick={() => updateTemplateMutation.mutate(activeTemplateId)}><SaveIcon fontSize="small" /></IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete template">
                      <IconButton size="small" color="error" onClick={() => deleteTemplateMutation.mutate(activeTemplateId)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </>
                )}
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Data Source</Typography>
              <FormControl size="small" fullWidth>
                <Select value={dataSource} onChange={(e) => applySource(e.target.value)}>
                  {(sources || []).map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
                </Select>
              </FormControl>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }} gutterBottom>Columns</Typography>
              <Autocomplete
                multiple size="small" disableCloseOnSelect
                options={source?.columns.map((c) => c.key) ?? []}
                getOptionLabel={(k) => colMeta(k)?.label || k}
                value={columns}
                onChange={(_, v) => setColumns(v)}
                renderTags={(value, getTagProps) =>
                  value.map((k, i) => <Chip size="small" label={colMeta(k)?.label || k} {...getTagProps({ index: i })} key={k} />)}
                renderInput={(params) => <TextField {...params} placeholder="Select columns" />}
              />

              <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Filters</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addFilter}>Add</Button>
              </Box>
              {filters.length === 0 && <Typography variant="caption" color="text.secondary">No filters — all rows.</Typography>}
              <Stack spacing={1.5} mt={1}>
                {filters.map((f, i) => {
                  const meta = colMeta(f.column);
                  const ops = OPS_BY_TYPE[meta?.type || 'string'] || OPS_BY_TYPE.string;
                  const arity = ops.find((o) => o.op === f.op)?.arity ?? 1;
                  return (
                    <Box key={i} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <FormControl size="small" sx={{ flex: 1 }}>
                          <Select
                            value={f.column}
                            onChange={(e) => {
                              const m = colMeta(e.target.value);
                              const newOps = OPS_BY_TYPE[m?.type || 'string'] || OPS_BY_TYPE.string;
                              updateFilter(i, { column: e.target.value, op: newOps[0].op, value: '', value2: '' });
                            }}
                          >
                            {source?.columns.filter((c) => c.filterable).map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                          </Select>
                        </FormControl>
                        <IconButton size="small" color="error" onClick={() => removeFilter(i)}><DeleteIcon fontSize="small" /></IconButton>
                      </Stack>
                      <Stack direction="row" spacing={1} mt={1}>
                        <FormControl size="small" sx={{ minWidth: 110 }}>
                          <Select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value, value: '', value2: '' })}>
                            {ops.map((o) => <MenuItem key={o.op} value={o.op}>{o.label}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {arity >= 1 && (
                          <TextField size="small" fullWidth type={inputType(meta?.type || 'string')}
                            InputLabelProps={meta?.type === 'date' ? { shrink: true } : undefined}
                            value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} />
                        )}
                        {arity === 2 && (
                          <TextField size="small" fullWidth type={inputType(meta?.type || 'string')}
                            InputLabelProps={meta?.type === 'date' ? { shrink: true } : undefined}
                            value={f.value2} onChange={(e) => updateFilter(i, { value2: e.target.value })} />
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }} gutterBottom>Sort & Limit</Typography>
              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel>Sort by</InputLabel>
                  <Select label="Sort by" value={sortCol} onChange={(e) => setSortCol(e.target.value)}>
                    <MenuItem value=""><em>Default</em></MenuItem>
                    {source?.columns.filter((c) => c.sortable).map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ width: 110 }}>
                  <Select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} disabled={!sortCol}>
                    <MenuItem value="desc">Desc</MenuItem>
                    <MenuItem value="asc">Asc</MenuItem>
                  </Select>
                </FormControl>
                <TextField size="small" type="number" label="Limit" sx={{ width: 90 }}
                  value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} />
              </Stack>

              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" fullWidth startIcon={<PlayArrowIcon />}
                  disabled={!columns.length || runMutation.isLoading} onClick={() => runMutation.mutate()}>
                  {runMutation.isLoading ? 'Running…' : 'Run'}
                </Button>
                <Button variant="outlined" startIcon={<SaveIcon />}
                  disabled={!dataSource} onClick={() => setSaveOpen(true)}>Save</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* ── Results ── */}
        <Grid item xs={12} md={8}>
          <Card variant="outlined">
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Results {result ? `(${result.rows.length} row${result.rows.length === 1 ? '' : 's'})` : ''}
                </Typography>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />}
                  disabled={!result?.rows?.length} onClick={exportCsv}>Export CSV</Button>
              </Box>

              {!result && (
                <Box py={8} textAlign="center" color="text.secondary">
                  <AssessmentIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                  <Typography variant="body2" mt={1}>Configure the report on the left and press <b>Run</b>.</Typography>
                </Box>
              )}

              {result && result.rows.length === 0 && (
                <Alert severity="info">No rows matched the selected filters.</Alert>
              )}

              {result && result.rows.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 560 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {result.columns.map((c: any) => <TableCell key={c.key} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.rows.map((row, ri) => (
                        <TableRow key={ri} hover>
                          {result.columns.map((c: any) => <TableCell key={c.key} sx={{ whiteSpace: 'nowrap' }}>{fmtCell(row[c.key], c.type)}</TableCell>)}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Save template dialog ── */}
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Save as Template</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Template name" margin="normal" size="small"
            value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <TextField fullWidth label="Description (optional)" margin="normal" size="small" multiline rows={2}
            value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} />
          <Typography variant="caption" color="text.secondary">
            Saves the data source, selected columns, filters and sort so you can re-run this report later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!saveName.trim() || saveMutation.isLoading}
            onClick={() => saveMutation.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
