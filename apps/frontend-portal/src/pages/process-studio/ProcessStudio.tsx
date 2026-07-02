import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Typography, Button, CircularProgress, Alert, Chip, Paper, Snackbar, Tooltip,
  IconButton,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PublishIcon from '@mui/icons-material/Publish';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CloseIcon from '@mui/icons-material/Close';
import { processApi, approvalApi } from '../../api/client';
import PropertiesPanel from './PropertiesPanel';

interface CheckFinding { id: string; message: string; severity: 'error' | 'warning'; }

/** Walk the model and surface things that would make a published process misbehave. */
function runChecks(modeler: any, hasApprovalPolicy: boolean): CheckFinding[] {
  const out: CheckFinding[] = [];
  if (!modeler) return out;
  let els: any[] = [];
  try { els = modeler.get('elementRegistry').getAll(); } catch { return out; }
  const ffOf = (bo: any): any[] => {
    const raw = bo?.$attrs?.['camunda:formFields'] || bo?.$attrs?.['activiti:formFields'];
    if (!raw) return [];
    try { return JSON.parse(decodeURIComponent(raw)); } catch { return []; }
  };
  els.forEach((el: any) => {
    const t: string = el.type?.replace('bpmn:', '') || '';
    const bo = el.businessObject;
    if (!t || t === 'Process' || t === 'Collaboration' || t === 'SequenceFlow' || t.startsWith('Label')) return;
    const label = bo?.name || el.id;
    const inc = (el.incoming || []).length;
    const outg = (el.outgoing || []).length;
    if (t !== 'StartEvent' && (t.endsWith('Task') || t.includes('Gateway') || t.includes('Event')) && inc === 0)
      out.push({ id: el.id, message: `"${label}" has no incoming flow`, severity: 'error' });
    if (t !== 'EndEvent' && (t.endsWith('Task') || t.includes('Gateway') || (t.includes('Event') && t !== 'EndEvent')) && outg === 0)
      out.push({ id: el.id, message: `"${label}" has no outgoing flow`, severity: 'error' });

    if (t === 'ExclusiveGateway' && outg > 1) {
      const missing = (el.outgoing || []).filter((f: any) => !f.businessObject?.conditionExpression?.body);
      if (missing.length > 1)
        out.push({ id: el.id, message: `Gateway "${label}" has ${missing.length} branches with no condition`, severity: 'warning' });
    }

    if (t === 'UserTask') {
      const fk = bo?.$attrs?.['camunda:formKey'] || bo?.$attrs?.['activiti:formKey'];
      if (fk === 'approval') {
        if (!hasApprovalPolicy)
          out.push({ id: el.id, message: `Approval gate "${label}" has no approval policy — it will fall back to a manual task`, severity: 'error' });
      } else if (!bo?.$attrs?.['camunda:assignee'] && !bo?.$attrs?.['camunda:candidateGroups']) {
        out.push({ id: el.id, message: `Task "${label}" has no assignee or candidate group`, severity: 'warning' });
      }
      ffOf(bo).forEach((f: any) => {
        if (f.type === 'select' && !(f.options || '').trim())
          out.push({ id: el.id, message: `Dropdown "${f.label || f.key}" in "${label}" has no options`, severity: 'warning' });
      });
    }

    if (t === 'StartEvent') {
      const ff = ffOf(bo);
      if (ff.length === 0)
        out.push({ id: el.id, message: `Start event captures no data (no start form)`, severity: 'warning' });
      ff.forEach((f: any) => {
        if (f.type === 'select' && !(f.options || '').trim())
          out.push({ id: el.id, message: `Start dropdown "${f.label || f.key}" has no options`, severity: 'warning' });
      });
    }
  });
  return out;
}

// Full BPMN 2.0 template including bpmndi:BPMNDiagram (required by bpmn-js v7+)
const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:camunda="http://activiti.org/bpmn"
             xmlns:activiti="http://activiti.org/bpmn"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="New Process" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Activity_1" name="User Task">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <endEvent id="EndEvent_1" name="End">
      <incoming>Flow_2</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="159" y="125" width="22" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1">
        <dc:Bounds x="250" y="60" width="100" height="80"/>
        <bpmndi:BPMNLabel/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="412" y="82" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="420" y="125" width="20" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100"/>
        <di:waypoint x="250" y="100"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="100"/>
        <di:waypoint x="412" y="100"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

// ── Auto-layout for Flowable imports (no BPMNDiagram section) ────────────────

const ELEMENT_TYPES_FOR_LAYOUT = [
  'startEvent', 'endEvent', 'userTask', 'serviceTask', 'scriptTask',
  'manualTask', 'receiveTask', 'sendTask',
  'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway',
  'intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent',
  'subProcess', 'callActivity',
];

function getShapeSize(type: string): { w: number; h: number } {
  if (['startEvent','endEvent','intermediateThrowEvent','intermediateCatchEvent','boundaryEvent'].includes(type))
    return { w: 36, h: 36 };
  if (type.includes('Gateway')) return { w: 50, h: 50 };
  return { w: 100, h: 80 };
}

/**
 * Generate a bpmndi:BPMNDiagram section with BFS-derived positions for all
 * process elements. Injected into Flowable-exported XML that has no layout data.
 */
function generateBpmnLayout(xml: string): string {
  // 1. Collect elements id → type
  const elements = new Map<string, string>();
  for (const type of ELEMENT_TYPES_FOR_LAYOUT) {
    const re = new RegExp(`<(?:[a-zA-Z]+:)?${type}\\s[^>]*?id="([^"]+)"`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) elements.set(m[1], type);
  }

  // 2. Collect sequence flows
  interface SFlow { id: string; source: string; target: string }
  const flows: SFlow[] = [];
  const flowRe = /<(?:[a-zA-Z]+:)?sequenceFlow\s[^>]*?id="([^"]*)"[^>]*?sourceRef="([^"]*)"[^>]*?targetRef="([^"]*)"/gi;
  let fm: RegExpExecArray | null;
  while ((fm = flowRe.exec(xml)) !== null) {
    if (fm[1] && fm[2] && fm[3]) flows.push({ id: fm[1], source: fm[2], target: fm[3] });
  }

  // 3. BFS from start event → assign column depth per node
  const succs = new Map<string, string[]>();
  elements.forEach((_, id) => succs.set(id, []));
  flows.forEach(f => succs.get(f.source)?.push(f.target));

  const startId = [...elements.entries()].find(([, t]) => t === 'startEvent')?.[0]
    ?? [...elements.keys()][0];
  const colOf = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [[startId, 0]];
  while (queue.length) {
    const [id, col] = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id); colOf.set(id, col);
    succs.get(id)?.forEach(s => { if (!visited.has(s)) queue.push([s, col + 1]); });
  }
  // disconnected nodes
  let extra = (colOf.size ? Math.max(...colOf.values()) : 0) + 1;
  elements.forEach((_, id) => { if (!colOf.has(id)) colOf.set(id, extra++); });

  // 4. Group by column, assign row within column
  const byCols = new Map<number, string[]>();
  colOf.forEach((col, id) => { if (!byCols.has(col)) byCols.set(col, []); byCols.get(col)!.push(id); });

  const COL_W = 180, ROW_H = 120, BASE_X = 120, BASE_Y = 240;
  const pos = new Map<string, { x: number; y: number }>();
  byCols.forEach((ids, col) => {
    ids.forEach((id, i) => {
      pos.set(id, {
        x: BASE_X + col * COL_W,
        y: BASE_Y + (i - Math.floor(ids.length / 2)) * ROW_H,
      });
    });
  });

  // 5. Get process id for BPMNPlane reference
  const procM = xml.match(/<(?:[a-zA-Z]+:)?process\s[^>]*?id="([^"]+)"/i);
  const procId = procM?.[1] ?? 'Process_1';

  // 6. Render shapes
  const shapes = [...pos.entries()].map(([id, p]) => {
    const { w, h } = getShapeSize(elements.get(id) ?? 'userTask');
    return `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">
        <dc:Bounds x="${Math.round(p.x - w / 2)}" y="${Math.round(p.y - h / 2)}" width="${w}" height="${h}"/>
      </bpmndi:BPMNShape>`;
  }).join('\n');

  // 7. Render edges (source-right → target-left with midpoint for visual clarity)
  const edges = flows.map(f => {
    const sp = pos.get(f.source); const tp = pos.get(f.target);
    if (!sp || !tp) return '';
    const { w: sw } = getShapeSize(elements.get(f.source) ?? 'userTask');
    const { w: tw } = getShapeSize(elements.get(f.target) ?? 'userTask');
    const x1 = Math.round(sp.x + sw / 2), y1 = Math.round(sp.y);
    const x2 = Math.round(tp.x - tw / 2), y2 = Math.round(tp.y);
    const mx = Math.round((x1 + x2) / 2);
    const waypoints = y1 === y2
      ? `        <di:waypoint x="${x1}" y="${y1}"/>\n        <di:waypoint x="${x2}" y="${y2}"/>`
      : `        <di:waypoint x="${x1}" y="${y1}"/>\n        <di:waypoint x="${mx}" y="${y1}"/>\n        <di:waypoint x="${mx}" y="${y2}"/>\n        <di:waypoint x="${x2}" y="${y2}"/>`;
    return `      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">\n${waypoints}\n      </bpmndi:BPMNEdge>`;
  }).filter(Boolean).join('\n');

  return `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${procId}">
${shapes}
${edges}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
}

/**
 * Convert <vendor:formProperty> extension elements (any prefix — flowable,
 * activiti, camunda) into the camunda:formFields attribute format that
 * PropertiesPanel reads and bpmn-parser.ts already handles. This lets processes
 * authored with formProperty elements (the launch/seed processes use
 * activiti:formProperty) round-trip through the Studio: their per-phase forms
 * become attributes BEFORE bpmn-js imports, so they show in the panel and
 * survive re-save (vanilla bpmn-js drops unknown extension elements otherwise).
 * Enum values are stored as "ID:Label" pairs so gateway conditions (${x=='ID'}) work.
 */
function convertFormProperties(xml: string): string {
  const TYPE_MAP: Record<string, string> = {
    string: 'text', textarea: 'textarea',
    long: 'number', integer: 'number', double: 'number',
    date: 'date', boolean: 'checkbox', enum: 'select',
  };
  const ga = (s: string, attr: string) => { const m = s.match(new RegExp(`\\b${attr}="([^"]*)"`)); return m ? m[1] : ''; };

  // Match formProperty of ANY vendor prefix; \1 backreferences the prefix on the
  // close tag. Built via new RegExp (not a /</ literal) to dodge the TS5.3 parser.
  const fpReSrc = '<([a-zA-Z0-9_]+):formProperty\\s([^>]*?)(?:/>|>([\\s\\S]*?)</\\1:formProperty>)';

  return xml.replace(
    /(<(?:bpmn2?:)?(?:userTask|startEvent)\s[^>]*>)([\s\S]*?)(<\/(?:bpmn2?:)?(?:userTask|startEvent)>)/gi,
    (_, openTag: string, body: string, closeTag: string) => {
      if (openTag.includes('formFields=')) return openTag + body + closeTag;

      const fpRe = new RegExp(fpReSrc, 'gi');
      const fields: any[] = [];
      let fp: RegExpExecArray | null;
      while ((fp = fpRe.exec(body)) !== null) {
        const pfx = fp[1]; const attrs = fp[2]; const fpBody = fp[3] || '';
        const fid = ga(attrs, 'id'); if (!fid) continue;
        const ftype = ga(attrs, 'type') || 'string';
        const field: any = { key: fid, label: ga(attrs, 'name') || fid, type: TYPE_MAP[ftype] || 'text', required: ga(attrs, 'required') === 'true' };
        if (ftype === 'enum' && fpBody) {
          // Try id before name, then name before id (attribute order varies)
          const valRe = new RegExp(`<${pfx}:value\\s[^>]*?(?:id="([^"]*)"[^>]*?name="([^"]*)"|name="([^"]*)"[^>]*?id="([^"]*)")`, 'gi');
          const opts: string[] = [];
          let vm: RegExpExecArray | null;
          while ((vm = valRe.exec(fpBody)) !== null) {
            const vid = (vm[1] || vm[4] || '').trim();
            const vlabel = (vm[2] || vm[3] || '').trim();
            if (vid) opts.push(vlabel ? `${vid}:${vlabel}` : vid); // "ID:Label" format
          }
          if (opts.length) field.options = opts.join(',');
        }
        fields.push(field);
      }
      if (!fields.length) return openTag + body + closeTag;
      const encoded = encodeURIComponent(JSON.stringify(fields));
      return openTag.replace(/>$/, ` camunda:formFields="${encoded}">`) + body + closeTag;
    },
  );
}

/**
 * Enrich a Flowable-exported BPMN with layout data so bpmn-js can render it.
 * Converts formProperty → camunda:formFields, injects DI namespaces, auto-generates BPMNDiagram.
 */
function enrichForBpmnJs(xml: string): string {
  // 1. Convert <flowable:formProperty> → camunda:formFields attribute
  let out = convertFormProperties(xml);

  // 2. Inject missing namespace declarations into the <definitions> opening tag
  const requiredNs: Array<[string, string]> = [
    ['camunda', 'http://activiti.org/bpmn'],            // for camunda:formFields
    ['bpmndi',  'http://www.omg.org/spec/BPMN/20100524/DI'],
    ['dc',      'http://www.omg.org/spec/DD/20100524/DC'],
    ['di',      'http://www.omg.org/spec/DD/20100524/DI'],
  ];
  for (const [pfx, uri] of requiredNs) {
    if (!out.includes(`xmlns:${pfx}=`)) {
      out = out.replace(
        /((?:xmlns:[^=]+="[^"]*"\s*\n)[^>]*?)(>)(\s*\n\s*<(?:[a-zA-Z]+:)?process)/,
        `$1\n  xmlns:${pfx}="${uri}"$2$3`,
      );
    }
  }

  // 3. Append auto-generated BPMNDiagram before </definitions>
  const layout = generateBpmnLayout(out);
  out = out.replace(/(<\/(?:[a-zA-Z]+:)?definitions>)/, `${layout}\n$1`);
  return out;
}

export default function ProcessStudio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const importState = location.state as { imported?: boolean; warnings?: string[] } | null;
  const [importBannerDismissed, setImportBannerDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<any>(null);
  const [modeler, setModeler] = useState<any>(null);
  const [snack, setSnack] = useState('');
  const [initError, setInitError] = useState('');
  const [checks, setChecks] = useState<CheckFinding[] | null>(null);

  const { data: def, isLoading } = useQuery(['process-def', id], () => processApi.getDef(id!));
  const { data: policiesData } = useQuery('approval-policies', () => approvalApi.listPolicies(1, 100), { staleTime: 30000 });
  const hasApprovalPolicy = (policiesData?.data || []).some((p: any) => p.process_key === def?.slug && p.active);

  const goToElement = (elId: string) => {
    const m = modelerRef.current; if (!m) return;
    try {
      const el = m.get('elementRegistry').get(elId);
      if (el) { m.get('selection').select(el); m.get('canvas').scrollToElement(el); }
    } catch { /* ignore */ }
  };
  const errorCount = (checks || []).filter(c => c.severity === 'error').length;

  const save = useMutation(async () => {
    if (!modelerRef.current) return { forked: null };
    const { xml } = await modelerRef.current.saveXML({ format: true });
    // Process-change safety: published/archived versions are immutable. Editing
    // one forks a new draft version and saves the changes into that draft, so
    // running instances (pinned to the published version) are never altered.
    if (def.status !== 'draft') {
      const draft = await processApi.newDefVersion(id!);
      await processApi.updateDef(draft.id, { bpmn_xml: xml });
      return { forked: draft };
    }
    await processApi.updateDef(id!, { bpmn_xml: xml });
    return { forked: null };
  }, {
    onSuccess: (res: any) => {
      if (res?.forked) {
        setSnack(`Saved as new draft v${res.forked.version} (the published version is unchanged)`);
        qc.invalidateQueries('process-defs');
        navigate(`/processes/${res.forked.id}/studio`);
      } else {
        setSnack('Saved!');
        qc.invalidateQueries(['process-def', id]);
      }
    },
    onError: (e: any) => setSnack(`Save failed: ${e.response?.data?.message || e.message}`),
  });

  const publish = useMutation(() => processApi.publishDef(id!), {
    onSuccess: () => {
      setSnack('Published!');
      qc.invalidateQueries(['process-def', id]);
      qc.invalidateQueries('process-defs');
    },
  });

  useEffect(() => {
    if (!def || !containerRef.current) return;
    let destroyed = false;

    import('bpmn-js/lib/Modeler').then(({ default: Modeler }) => {
      if (destroyed || !containerRef.current) return;
      const m = new Modeler({ container: containerRef.current });
      modelerRef.current = m;
      setModeler(m);
      // bpmn-js requires a bpmndi:BPMNDiagram section for rendering.
      // Flowable exports lack it — auto-generate a BFS layout instead of falling
      // back to the empty template (which would discard the imported process).
      let xmlToLoad: string;
      if (!def.bpmn_xml) {
        xmlToLoad = EMPTY_BPMN;
      } else {
        // Always normalize vendor formProperty → camunda:formFields first, so any
        // process (incl. the launch/seed ones authored with activiti:formProperty)
        // round-trips with its per-phase forms visible and editable in the panel.
        let normalized = convertFormProperties(def.bpmn_xml);
        if (normalized.includes('camunda:formFields') && !normalized.includes('xmlns:camunda=')) {
          normalized = normalized.replace(/(<(?:[a-zA-Z]+:)?definitions\b)/, '$1 xmlns:camunda="http://activiti.org/bpmn"');
        }
        // Ensure a diagram layout exists (Flowable/seed exports have none).
        xmlToLoad = normalized.includes('BPMNDiagram') ? normalized : enrichForBpmnJs(normalized);
      }
      m.importXML(xmlToLoad).catch((e: any) => setInitError(e.message));
    }).catch(e => setInitError(e.message));

    return () => {
      destroyed = true;
      modelerRef.current?.destroy();
      modelerRef.current = null;
      setModeler(null);
    };
  }, [def?.id]);

  if (isLoading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!def) return <Alert severity="error">Process not found</Alert>;

  return (
    // Viewport-height layout: AppBar=64px + padding-top=24px + padding-bottom=24px = 112px
    <Box sx={{ height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper elevation={0} sx={{ mb: 1, p: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', flexShrink: 0 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/processes')}>Back</Button>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{def.name}</Typography>
        <Chip label={`v${def.version}`} size="small" />
        <Chip label={def.status} size="small" color={def.status === 'active' ? 'success' : 'warning'} />
        <Tooltip title="Check the process for problems before publishing">
          <Button size="small" variant="outlined" startIcon={<FactCheckIcon />}
            onClick={() => setChecks(runChecks(modelerRef.current, hasApprovalPolicy))}>
            Checks
          </Button>
        </Tooltip>
        <Tooltip title={def.status !== 'draft' ? 'This version is published and immutable — saving creates a new editable draft version' : ''}>
          <Button size="small" variant="outlined" startIcon={<SaveIcon />} onClick={() => save.mutate()} disabled={save.isLoading}>
            {def.status !== 'draft' ? 'Save as new version' : 'Save'}
          </Button>
        </Tooltip>
        {def.status !== 'active' && (
          <Button size="small" variant="contained" color="success" startIcon={<PublishIcon />}
            onClick={() => {
              const found = runChecks(modelerRef.current, hasApprovalPolicy);
              const errs = found.filter(c => c.severity === 'error');
              if (errs.length) { setChecks(found); setSnack(`${errs.length} blocking issue(s) — review Checks before publishing`); return; }
              publish.mutate();
            }} disabled={publish.isLoading}>
            Publish
          </Button>
        )}
      </Paper>

      {/* Publish-readiness findings */}
      {checks !== null && (
        <Paper variant="outlined" sx={{ mb: 1, p: 1, flexShrink: 0, maxHeight: 180, overflowY: 'auto' }}>
          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
            {checks.length === 0
              ? <><CheckCircleIcon color="success" fontSize="small" /><Typography variant="body2">No issues found — ready to publish.</Typography></>
              : <Typography variant="body2" sx={{ fontWeight: 600 }}>{errorCount} error(s), {checks.length - errorCount} warning(s)</Typography>}
            <Box sx={{ flexGrow: 1 }} />
            <IconButton size="small" onClick={() => setChecks(null)}><CloseIcon fontSize="small" /></IconButton>
          </Box>
          {checks.map((c, i) => (
            <Box key={i} onClick={() => goToElement(c.id)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#f5f5f5' } }}>
              {c.severity === 'error' ? <ErrorOutlineIcon color="error" fontSize="small" /> : <WarningAmberIcon color="warning" fontSize="small" />}
              <Typography variant="caption">{c.message}</Typography>
            </Box>
          ))}
        </Paper>
      )}

      {importState?.imported && !importBannerDismissed && (
        <Alert severity="info" sx={{ mb: 1, flexShrink: 0 }} onClose={() => setImportBannerDismissed(true)}>
          <strong>Imported from Flowable Studio</strong> — review the diagram and properties before publishing.
          {importState.warnings?.length ? (
            <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2 }}>
              {importState.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </Box>
          ) : null}
        </Alert>
      )}

      {initError && <Alert severity="warning" sx={{ mb: 1, flexShrink: 0 }}>BPMN editor error: {initError}</Alert>}

      {/* Main area: canvas + properties panel */}
      <Box sx={{ display: 'flex', flexGrow: 1, gap: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* BPMN Canvas */}
        <Box
          ref={containerRef}
          sx={{
            flexGrow: 1,
            border: '1px solid #e0e0e0',
            borderRadius: 2,
            bgcolor: '#fafafa',
            minWidth: 0,
            position: 'relative',
            overflow: 'hidden',
            '& .bjs-container': { width: '100%', height: '100%' },
            '& .djs-container': { width: '100% !important', height: '100% !important' },
          }}
        />

        {/* Properties Panel */}
        <Paper
          elevation={1}
          sx={{
            width: 360,
            flexShrink: 0,
            borderRadius: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e0e0e0', bgcolor: '#f5f5f5', flexShrink: 0 }}>
            <Typography variant="subtitle2">Properties</Typography>
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <PropertiesPanel modeler={modeler} slug={def.slug} processName={def.name} />
          </Box>
        </Paper>
      </Box>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Box>
  );
}
