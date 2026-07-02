import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Chip, Grid,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import BarChartIcon from '@mui/icons-material/BarChart';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import { processApi } from '../../api/client';
import { useState } from 'react';

// ── BPMN content helpers ─────────────────────────────────────────────────────

const BPMN_NS     = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const FLOWABLE_NS = 'http://flowable.org/bpmn';

interface ProcessInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
}

interface ParsedBpmn {
  doc: Document;
  processes: ProcessInfo[];
  error: string | null;
}

/**
 * Parse and validate a BPMN 2.0 XML string using the browser's DOMParser.
 * Accepts any namespace prefix (e.g. <bpmn:definitions>, <definitions>).
 */
/**
 * Escape bare & characters that are not already part of a valid XML entity
 * reference (&amp; &lt; &gt; &quot; &apos; &#123; &#xAB; &namedEntity;).
 * Common cause: URLs with query strings (foo=1&bar=2) in attribute values.
 */
function sanitizeAmpersands(xml: string): string {
  // Replace & not followed by a valid entity pattern
  return xml.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function parseBpmnFile(xml: string, fileName: string): ParsedBpmn {
  // 1. Strip UTF-8 BOM (\uFEFF) — common in Windows-authored files
  let cleanXml = xml.replace(/^\uFEFF/, '');

  const parser = new DOMParser();
  let doc = parser.parseFromString(cleanXml, 'application/xml');

  // DOMParser signals XML errors via a <parsererror> element
  if (doc.getElementsByTagName('parsererror').length) {
    // 2. Escape bare & characters (e.g. URLs with ?a=1&b=2, unescaped conditions)
    //    and retry — this is the most common real-world cause of parse failures
    const sanitized = sanitizeAmpersands(cleanXml);
    doc = parser.parseFromString(sanitized, 'application/xml');

    if (doc.getElementsByTagName('parsererror').length) {
      // 3. Strip the XML declaration and retry (encoding declaration edge cases)
      const withoutDecl = sanitized.replace(/^<\?xml[^?]*\?>\s*/i, '');
      doc = parser.parseFromString(withoutDecl, 'application/xml');

      if (doc.getElementsByTagName('parsererror').length) {
        // Surface the real parser error for diagnosis
        const rawErr = doc.getElementsByTagName('parsererror')[0].textContent || '';
        const firstLine = rawErr.trim().split('\n')[0].replace(/^error\s*on\s*line\s*/i, '').trim();
        return { doc, processes: [], error: `Invalid XML: ${firstLine || 'the file could not be parsed.'}` };
      }
    }
  }

  const root = doc.documentElement;

  // Accept any prefix: check localName, not nodeName
  if (root.localName !== 'definitions') {
    return { doc, processes: [], error: 'Not a BPMN 2.0 file: root element must be <definitions>.' };
  }

  // Validate BPMN namespace (tolerant: allow missing namespaceURI for plain <definitions>)
  if (root.namespaceURI && root.namespaceURI !== BPMN_NS) {
    return { doc, processes: [], error: `Not a BPMN 2.0 file: unexpected namespace "${root.namespaceURI}".` };
  }

  // Extract all <process> elements regardless of prefix
  const procEls = Array.from(doc.getElementsByTagNameNS('*', 'process'));
  if (procEls.length === 0) {
    return { doc, processes: [], error: 'No <process> element found in file.' };
  }

  const targetNs = root.getAttribute('targetNamespace') || '';

  const processes: ProcessInfo[] = procEls.map(p => {
    const rawId   = p.getAttribute('id')   || '';
    const rawName = p.getAttribute('name') || '';
    const name    = rawName || fileName.replace(/\.(bpmn|xml)$/i, '');
    const slug    = (rawId || rawName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // <documentation> child element (any prefix)
    const docEl = p.getElementsByTagNameNS('*', 'documentation')[0];
    const description = docEl?.textContent?.trim() || '';

    // category: flowable:category namespaced attribute, else last segment of targetNamespace
    let category = p.getAttributeNS(FLOWABLE_NS, 'category') || '';
    if (!category && targetNs) {
      const nsM = targetNs.match(/\/([^/]+)$/);
      if (nsM) category = nsM[1];
    }

    return { id: rawId, name, slug, description, category };
  });

  return { doc, processes, error: null };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ProcessList() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // New-process dialog
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', category: '' });
  const [error, setError] = useState('');

  // Import-BPMN dialog
  const [importing, setImporting] = useState(false);
  const [importXml, setImportXml]         = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError]     = useState('');
  const [importProcesses, setImportProcesses] = useState<ProcessInfo[]>([]);
  const [selectedProcId, setSelectedProcId]   = useState('');
  const [importForm, setImportForm] = useState({ name: '', slug: '', description: '', category: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery('process-defs', () => processApi.listDefs(1, 50));

  const create = useMutation(processApi.createDef, {
    onSuccess: (def) => { qc.invalidateQueries('process-defs'); setCreating(false); navigate(`/processes/${def.id}/studio`); },
    onError:   (e: any) => setError(e.response?.data?.message || e.message),
  });

  const importDef = useMutation(processApi.createDef, {
    onSuccess: (def) => {
      qc.invalidateQueries('process-defs');
      setImporting(false);
      navigate(`/processes/${def.id}/studio`, { state: { imported: true } });
    },
    onError: (e: any) => setImportError(e.response?.data?.message || e.message),
  });

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting same file

    const reader = new FileReader();
    reader.onload = (evt) => {
      const xml = (evt.target?.result as string) || '';

      const { processes, error: parseError } = parseBpmnFile(xml, file.name);
      if (parseError) {
        setImportError(parseError);
        setImportXml('');
        setImportProcesses([]);
        return;
      }

      setImportFileName(file.name);
      setImportXml(xml);
      setImportError('');
      setImportProcesses(processes);
      // Auto-select the first process
      setSelectedProcId(processes[0].id);
      const { name, slug, description, category } = processes[0];
      setImportForm({ name, slug, description, category });
    };
    reader.readAsText(file);
  };

  const handleProcessSelect = (procId: string) => {
    setSelectedProcId(procId);
    const proc = importProcesses.find(p => p.id === procId);
    if (proc) {
      const { name, slug, description, category } = proc;
      setImportForm({ name, slug, description, category });
    }
  };

  const openImportDialog = () => {
    setImportXml(''); setImportFileName(''); setImportError('');
    setImportProcesses([]); setSelectedProcId('');
    setImportForm({ name: '', slug: '', description: '', category: '' });
    setImporting(true);
  };

  // ── Delete confirmation dialog ──────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // ── Mutations ───────────────────────────────────────────────────────────────
  const publish = useMutation((id: string) => processApi.publishDef(id), {
    onSuccess: () => qc.invalidateQueries('process-defs'),
  });

  const unpublish = useMutation((id: string) => processApi.unpublishDef(id), {
    onSuccess: () => qc.invalidateQueries('process-defs'),
  });

  const deleteDef = useMutation((id: string) => processApi.deleteDef(id), {
    onSuccess: () => { qc.invalidateQueries('process-defs'); setConfirmDelete(null); setDeleteError(''); },
    onError: (e: any) => setDeleteError(e.response?.data?.message || e.message),
  });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Process Studio</Typography>
        <Box display="flex" gap={1}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={openImportDialog}>
            Import BPMN
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New Process
          </Button>
        </Box>
      </Box>

      {/* Process cards */}
      <Grid container spacing={3}>
        {data?.data?.map((def: any) => (
          <Grid item xs={12} sm={6} md={4} key={def.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Typography variant="h6">{def.name}</Typography>
                  <Chip label={def.status} size="small"
                    color={def.status === 'active' ? 'success' : def.status === 'draft' ? 'warning' : 'default'} />
                </Box>
                <Typography variant="caption" color="text.secondary">{def.slug} · v{def.version}</Typography>
                {def.category && <Chip label={def.category} size="small" sx={{ mt: 1 }} />}
              </CardContent>
              <CardActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                <Button size="small" startIcon={<EditIcon />} onClick={() => navigate(`/processes/${def.id}/studio`)}>
                  Studio
                </Button>
                {def.status === 'active' && (
                  <Button size="small" startIcon={<BarChartIcon />}
                    onClick={() => navigate(`/processes/instances?definitionId=${def.id}`)}>
                    Instances
                  </Button>
                )}
                {def.status === 'draft' && (
                  <Button size="small" color="success" onClick={() => publish.mutate(def.id)}>
                    Publish
                  </Button>
                )}
                {def.status === 'active' && (
                  <Button size="small" color="warning" startIcon={<UnpublishedIcon />}
                    onClick={() => unpublish.mutate(def.id)}>
                    Unpublish
                  </Button>
                )}
                {def.status !== 'active' && (
                  <Button size="small" color="error" startIcon={<DeleteIcon />}
                    onClick={() => { setDeleteError(''); setConfirmDelete({ id: def.id, name: def.name }); }}>
                    Delete
                  </Button>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
        {!data?.data?.length && (
          <Grid item xs={12}>
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <Typography color="text.secondary">No process definitions yet. Create your first one!</Typography>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Process Definition</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error" sx={{ mb: 1 }}>{deleteError}</Alert>}
          <Typography>
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>?
            This cannot be undone. Deletion will fail if process instances exist.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />}
            disabled={deleteDef.isLoading}
            onClick={() => confirmDelete && deleteDef.mutate(confirmDelete.id)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".bpmn,.xml,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Import BPMN dialog ── */}
      <Dialog open={importing} onClose={() => setImporting(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import BPMN from Flowable Studio</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {importError && <Alert severity="error">{importError}</Alert>}

          <Button variant="outlined" startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}>
            {importFileName || 'Choose .bpmn or .xml file'}
          </Button>

          {importXml && importProcesses.length > 1 && (
            <TextField
              select label="Process to import"
              value={selectedProcId}
              onChange={e => handleProcessSelect(e.target.value)}
              helperText={`${importProcesses.length} processes found in file`}
            >
              {importProcesses.map(p => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} {p.id ? `(${p.id})` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}

          {importXml && (
            <>
              <TextField
                required label="Process Name"
                value={importForm.name}
                onChange={e => setImportForm(f => ({ ...f, name: e.target.value }))}
              />
              <TextField
                required label="Slug (unique key)"
                value={importForm.slug}
                onChange={e => setImportForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                helperText="Used to reference this process programmatically"
              />
              <TextField
                label="Description"
                multiline rows={2}
                value={importForm.description}
                onChange={e => setImportForm(f => ({ ...f, description: e.target.value }))}
              />
              <TextField
                label="Category"
                value={importForm.category}
                onChange={e => setImportForm(f => ({ ...f, category: e.target.value }))}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImporting(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            disabled={!importXml || !importForm.name || !importForm.slug || importDef.isLoading}
            onClick={() => importDef.mutate({ ...importForm, bpmn_xml: importXml })}
          >
            Import & Open Studio
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── New process dialog ── */}
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Process Definition</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField required label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <TextField required label="Slug (unique key)" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
          <TextField label="Description" multiline rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <TextField label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!form.name || !form.slug || create.isLoading}
            onClick={() => create.mutate(form)}>Create & Open</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
