/**
 * BPMN 2.0 XML parser, built on `fast-xml-parser` (already a dependency).
 *
 * Namespace-agnostic: detects the actual xmlns prefix bound to each vendor
 * namespace URI from the document's own `xmlns:*` declarations, rather than
 * assuming a fixed literal prefix (e.g. "flowable:") — so Studio-authored
 * (camunda:-ish), Flowable-exported (flowable:), and Activiti/Camunda-exported
 * (activiti:) BPMN all resolve the same logical attributes.
 *
 * Rewritten from a per-type regex scan (see git history) to a real parse tree
 * because the regex approach had two confirmed correctness bugs:
 *   1. Elements were collected in one regex pass PER TYPE, so `elements`
 *      never reflected true document order — it was grouped by type instead
 *      (all startEvents, then all endEvents, then all userTasks, ...).
 *   2. A document with more than one <process> had every element-type regex
 *      scan the WHOLE file, silently merging elements/flows from every
 *      process into one BpmnProcess — a real risk for a multi-process import.
 * Both are fixed here: this walks only the first <process> element's own
 * subtree, in document order.
 */
import { XMLParser } from 'fast-xml-parser';
import { safeEvalBoolean } from './safe-expr';

// ── Namespace URIs ──────────────────────────────────────────────────────────
const NS_FLOWABLE = 'http://flowable.org/bpmn';
const NS_CAMUNDA  = 'http://activiti.org/bpmn';          // also used by Camunda 7
const NS_CAMUNDA2 = 'http://camunda.org/schema/1.0/bpmn';

interface Prefixes {
  flowable: string;
  camunda: string;
  bpm: string;
}

// ── Public interfaces (unchanged — process-instance.service.ts and others
//    depend on this exact shape) ─────────────────────────────────────────────
export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  required: boolean;
  options?: string;
}

export interface BpmnElement {
  id: string;
  type: string;
  name?: string;
  assignee?: string;
  candidateGroups?: string[];
  candidateUsers?: string[];
  dueDate?: string;
  formKey?: string;
  slaHours?: number;
  scriptContent?: string;
  scriptFormat?: string;
  serviceType?: string;
  serviceExpression?: string;
  /** Parsed JSON object from `camunda:serviceConfig`, when it's valid JSON. */
  config?: Record<string, any>;
  /** Raw `camunda:serviceConfig` string as written by the Properties Panel —
   *  kept even when it fails to parse as JSON, so validation can report
   *  exactly what's wrong instead of silently dropping it. Previously this
   *  attribute was written by PropertiesPanel.tsx but never read here at
   *  all — Service Task config was write-only from the Studio's perspective. */
  configRaw?: string;
  formFields?: FormField[];
  /** The `default="flowId"` attribute on a gateway — the flow to take when no
   *  conditioned branch matches. Previously parsed but never captured. */
  defaultFlow?: string;
  /** `camunda:allowUnassigned="true"` — an explicit, author-set opt-in for a
   *  human task to enter the unassigned work queue with no assignee/candidate
   *  group. Never inferred from empty fields. */
  allowUnassigned?: boolean;
  /** `camunda:startMode` on the Start Event — `service_catalog` (default when
   *  unset, for backward compatibility with every already-published process),
   *  `api`, or `system`. Only `service_catalog` requires a start form. */
  startMode?: string;
}

export interface BpmnFlow {
  id: string;
  source: string;
  target: string;
  condition?: string;
  name?: string;
}

export interface BpmnProcess {
  id: string;
  name: string;
  elements: BpmnElement[];
  flows: BpmnFlow[];
  startEventId?: string;
  /** Variable name into which the process initiator id is stored (flowable:initiator). */
  initiatorVariableName?: string;
  /** Runtime dependency warnings surfaced at import time. */
  warnings: string[];
}

// ── Parse-tree node helpers (fast-xml-parser preserveOrder shape) ───────────
// A node looks like: { [tagName]: ChildNode[], ':@'?: Record<string, any> }
type XNode = Record<string, any>;

function tagOf(node: XNode): string | null {
  const k = Object.keys(node).find(k => k !== ':@');
  return k ?? null;
}
function localName(tagName: string): string {
  const i = tagName.indexOf(':');
  return i === -1 ? tagName : tagName.slice(i + 1);
}
function childrenOf(node: XNode): XNode[] {
  const t = tagOf(node);
  return t ? (node[t] as XNode[]) : [];
}
function attrsOf(node: XNode): Record<string, any> {
  return node[':@'] || {};
}
/** Direct-child elements matching a local (unprefixed) tag name. */
function directChildren(node: XNode, localTag: string): XNode[] {
  return childrenOf(node).filter(c => {
    const t = tagOf(c);
    return t !== null && localName(t) === localTag;
  });
}
/** Concatenated text content of a node's direct #text children. */
function textOf(node: XNode): string {
  return childrenOf(node)
    .filter(c => Object.prototype.hasOwnProperty.call(c, '#text'))
    .map(c => String(c['#text']))
    .join('')
    .trim();
}
/** Read an attribute by exact literal name (e.g. "id", "camunda:assignee"). */
function attr(node: XNode, name: string): string | undefined {
  const v = attrsOf(node)[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}
function attrAny(node: XNode, localAttr: string, ...prefixes: string[]): string | undefined {
  for (const pfx of prefixes) {
    if (!pfx) continue;
    const v = attr(node, `${pfx}:${localAttr}`);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Resolve the xmlns prefixes actually bound to each vendor URI in this document. */
function extractPrefixes(rootAttrs: Record<string, any>): Prefixes {
  const findPrefix = (uri: string, fallback: string): string => {
    for (const [k, v] of Object.entries(rootAttrs)) {
      if (k.startsWith('@_xmlns:') && v === uri) return k.slice('@_xmlns:'.length);
    }
    return fallback;
  };
  const camundaPfx = findPrefix(NS_CAMUNDA, '');
  return {
    flowable: findPrefix(NS_FLOWABLE, 'flowable'),
    camunda: camundaPfx || findPrefix(NS_CAMUNDA2, 'camunda'),
    bpm: findPrefix('http://bpm', 'bpm'),
  };
}

const ELEMENT_TYPES = [
  'startEvent', 'endEvent',
  'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'receiveTask', 'sendTask',
  'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway',
  'intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent',
  'subProcess', 'callActivity',
];
const CONTAINER_TYPES = ['subProcess', 'transaction', 'adHocSubProcess'];

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

/**
 * Recursively collect BPMN flow elements from a process (or subProcess)
 * subtree, in true document order. Recurses into subProcess/transaction
 * containers so nested elements are still visible in the flat `elements`
 * list — matching the previous regex parser's flattening behavior, since
 * the runtime does not execute subProcess as a real scoped container.
 */
function collectElements(node: XNode, pfx: Prefixes, xmlForFallback: string, out: BpmnElement[]) {
  for (const child of childrenOf(node)) {
    const tag = tagOf(child);
    if (!tag) continue;
    const local = localName(tag);

    if (ELEMENT_TYPES.includes(local)) {
      const el = extractElement(child, local, pfx, xmlForFallback);
      if (el) out.push(el);
      if (CONTAINER_TYPES.includes(local)) collectElements(child, pfx, xmlForFallback, out);
      continue;
    }
    // Not itself a flow element — but might contain some (e.g. a plain
    // <process> we're already inside, or a wrapping <extensionElements> we
    // should NOT descend into). Only recurse into known container tags.
    if (CONTAINER_TYPES.includes(local)) collectElements(child, pfx, xmlForFallback, out);
  }
}

function extractElement(node: XNode, type: string, pfx: Prefixes, xmlForFallback: string): BpmnElement | null {
  const id = attr(node, 'id');
  if (!id) return null;

  const el: BpmnElement = {
    id,
    type,
    name: attr(node, 'name'),
    assignee: attrAny(node, 'assignee', pfx.camunda, pfx.flowable),
    formKey: attrAny(node, 'formKey', pfx.camunda, pfx.flowable),
  };

  const cg = attrAny(node, 'candidateGroups', pfx.camunda, pfx.flowable);
  if (cg) el.candidateGroups = cg.split(',').map(s => s.trim()).filter(Boolean);

  const cu = attrAny(node, 'candidateUsers', pfx.flowable, pfx.camunda);
  if (cu) el.candidateUsers = cu.split(',').map(s => s.trim()).filter(Boolean);

  const slaAttr = attrAny(node, 'slaHours', pfx.camunda, pfx.flowable, pfx.bpm);
  if (slaAttr) el.slaHours = parseFloat(slaAttr);
  else {
    const slaExt = extensionPropertyValue(node, 'slaHours', pfx);
    if (slaExt) el.slaHours = parseFloat(slaExt);
  }

  const svcAttr = attrAny(node, 'serviceType', pfx.camunda, pfx.flowable, pfx.bpm);
  if (svcAttr) el.serviceType = svcAttr;
  else {
    const svcExt = extensionPropertyValue(node, 'serviceType', pfx);
    if (svcExt) el.serviceType = svcExt;
  }

  if (type === 'serviceTask') {
    const cfgRaw = attrAny(node, 'serviceConfig', pfx.camunda, pfx.flowable, pfx.bpm);
    if (cfgRaw) {
      el.configRaw = cfgRaw;
      try { el.config = JSON.parse(cfgRaw); } catch { /* left as configRaw only — validation reports this */ }
    }
  }

  if (type === 'exclusiveGateway' || type === 'inclusiveGateway') {
    const def = attr(node, 'default');
    if (def) el.defaultFlow = def;
  }

  if (type === 'userTask') {
    const au = attrAny(node, 'allowUnassigned', pfx.camunda, pfx.flowable);
    if (au !== undefined) el.allowUnassigned = au === 'true';
  }

  if (type === 'startEvent') {
    const sm = attrAny(node, 'startMode', pfx.camunda, pfx.flowable);
    if (sm) el.startMode = sm;
  }

  // formFields — URL-encoded JSON array (platform-native format). Accept
  // either resolved prefix or the literal "camunda"/"activiti" strings, so
  // both Studio-authored and the launch/seed BPMN (authored with activiti:)
  // round-trip regardless of how the namespace prefix resolves.
  const ffRaw = attrAny(node, 'formFields', pfx.camunda, pfx.flowable, pfx.bpm, 'camunda', 'activiti');
  if (ffRaw) {
    try { el.formFields = JSON.parse(decodeURIComponent(ffRaw)); } catch { /* ignore malformed */ }
  }

  // Fallback: <flowable:formProperty> / <camunda:formProperty> extension
  // elements (standard Flowable Studio / Camunda Modeler export format).
  if (!el.formFields?.length && (type === 'userTask' || type === 'startEvent')) {
    const fields = extractFormProperties(node, pfx);
    if (fields.length) el.formFields = fields;
  }

  if (type === 'scriptTask') {
    const fmtAttr = attrAny(node, 'scriptFormat', pfx.flowable, pfx.camunda);
    if (fmtAttr) el.scriptFormat = fmtAttr;
    const scriptNode = childrenOf(node).find(c => { const t = tagOf(c); return t && localName(t) === 'script'; });
    if (scriptNode) {
      const body = textOf(scriptNode);
      if (body) el.scriptContent = body;
    }
  }

  if (type === 'serviceTask') {
    const expr =
      attrAny(node, 'expression', pfx.flowable, pfx.camunda) ||
      attrAny(node, 'delegateExpression', pfx.flowable, pfx.camunda) ||
      attrAny(node, 'class', pfx.flowable, pfx.camunda);
    if (expr) el.serviceExpression = expr;
  }

  return el;
}

/** Reads <ns:extensionElements><ns:property name="X" value="Y"/></...> for a given property name. */
function extensionPropertyValue(node: XNode, prop: string, pfx: Prefixes): string | undefined {
  const extEl = childrenOf(node).find(c => { const t = tagOf(c); return t && localName(t) === 'extensionElements'; });
  if (!extEl) return undefined;
  for (const child of childrenOf(extEl)) {
    const t = tagOf(child);
    if (!t || localName(t) !== 'property') continue;
    if (attr(child, 'name') === prop) return attr(child, 'value');
  }
  return undefined;
}

function extractFormProperties(node: XNode, pfx: Prefixes): FormField[] {
  const extEl = childrenOf(node).find(c => { const t = tagOf(c); return t && localName(t) === 'extensionElements'; });
  if (!extEl) return [];
  const fields: FormField[] = [];
  for (const child of childrenOf(extEl)) {
    const t = tagOf(child);
    if (!t || localName(t) !== 'formProperty') continue;
    const fid = attr(child, 'id');
    if (!fid) continue;
    const fname = attr(child, 'name') || fid;
    const ftype = attr(child, 'type') || 'string';
    const frequired = attr(child, 'required') === 'true';
    let mappedType: FormField['type'];
    switch (ftype) {
      case 'long': case 'double': case 'integer': mappedType = 'number'; break;
      case 'date':     mappedType = 'date';     break;
      case 'boolean':  mappedType = 'checkbox'; break;
      case 'textarea': mappedType = 'textarea'; break;
      case 'enum':     mappedType = 'select';   break;
      default:         mappedType = 'text';
    }
    const field: FormField = { key: fid, label: fname, type: mappedType, required: frequired };
    if (ftype === 'enum') {
      const opts: string[] = [];
      for (const valueNode of childrenOf(child)) {
        const vt = tagOf(valueNode);
        if (!vt || localName(vt) !== 'value') continue;
        const optId = (attr(valueNode, 'id') || '').trim();
        const optLabel = (attr(valueNode, 'name') || '').trim();
        if (optId && optLabel && optId !== optLabel) opts.push(`${optId}:${optLabel}`);
        else if (optId || optLabel) opts.push(optId || optLabel);
      }
      if (opts.length) field.options = opts.join(',');
    }
    fields.push(field);
  }
  return fields;
}

// ── Main parser ──────────────────────────────────────────────────────────────
export function parseBpmn(xml: string): BpmnProcess {
  const warnings: string[] = [];
  let processId = 'process';
  let processName = 'Unnamed Process';
  let initiatorVariableName: string | undefined;
  const elements: BpmnElement[] = [];
  const flows: BpmnFlow[] = [];

  let root: XNode[];
  try {
    root = xmlParser.parse(xml);
  } catch {
    // Unparseable XML — return an empty process rather than throwing, matching
    // the previous parser's tolerant behavior (callers treat a missing
    // startEventId as "nothing to advance").
    return { id: processId, name: processName, elements, flows, warnings };
  }

  const definitionsNode = root.find(n => { const t = tagOf(n); return t !== null && localName(t) === 'definitions'; });
  if (!definitionsNode) return { id: processId, name: processName, elements, flows, warnings };

  const pfx = extractPrefixes(attrsOf(definitionsNode));

  // Only the FIRST <process> element is executed — matches prior behavior of
  // reading the first process's id/name — but unlike the old regex scan,
  // elements/flows are now scoped strictly to THIS process's own subtree, so
  // a second <process> in the same file can never bleed its nodes in.
  const processNode = directChildren(definitionsNode, 'process')[0];
  if (!processNode) return { id: processId, name: processName, elements, flows, warnings };

  processId = attr(processNode, 'id') || processId;
  processName = attr(processNode, 'name') || processName;

  collectElements(processNode, pfx, xml, elements);

  // startEvent initiator (flowable:initiator) — process-level metadata, not an assignee.
  const startNode = directChildren(processNode, 'startEvent')[0];
  if (startNode) {
    const initiator = attrAny(startNode, 'initiator', pfx.flowable, pfx.camunda);
    if (initiator) initiatorVariableName = initiator;
  }

  // Sequence flows — direct children only (flows inside a nested subProcess
  // are also collected, matching the flattening behavior for elements above).
  collectFlows(processNode, flows);

  // Service-task delegate/expression warnings (kept from the previous parser —
  // surfaced at import time so an author knows a bean/class must exist).
  for (const el of elements) {
    if (el.type === 'serviceTask' && el.serviceExpression) {
      const expr = el.serviceExpression;
      const hint = expr.startsWith('${') || expr.startsWith('#{')
        ? `Service task "${el.name || el.id}" uses expression "${expr}" which requires a matching bean at runtime.`
        : `Service task "${el.name || el.id}" uses delegate class "${expr}" which must be on the engine classpath.`;
      warnings.push(hint);
    }
  }

  const startEvent = elements.find(e => e.type === 'startEvent');

  return {
    id: processId,
    name: processName,
    elements,
    flows,
    startEventId: startEvent?.id,
    initiatorVariableName,
    warnings,
  };
}

function collectFlows(node: XNode, out: BpmnFlow[]) {
  for (const child of childrenOf(node)) {
    const tag = tagOf(child);
    if (!tag) continue;
    const local = localName(tag);
    if (local === 'sequenceFlow') {
      const id = attr(child, 'id');
      const source = attr(child, 'sourceRef');
      const target = attr(child, 'targetRef');
      if (id && source && target) {
        const flow: BpmnFlow = { id, source, target, name: attr(child, 'name') };
        const condNode = childrenOf(child).find(c => { const t = tagOf(c); return t && localName(t) === 'conditionExpression'; });
        if (condNode) {
          const body = textOf(condNode);
          if (body) flow.condition = body;
        }
        out.push(flow);
      }
      continue;
    }
    if (CONTAINER_TYPES.includes(local)) collectFlows(child, out);
  }
}

/** Get outgoing flows from a given element */
export function getOutgoingFlows(process: BpmnProcess, elementId: string): BpmnFlow[] {
  return process.flows.filter(f => f.source === elementId);
}

/** Get incoming flows to a given element */
export function getIncomingFlows(process: BpmnProcess, elementId: string): BpmnFlow[] {
  return process.flows.filter(f => f.target === elementId);
}

/** Get element by ID */
export function getElementById(process: BpmnProcess, id: string): BpmnElement | undefined {
  return process.elements.find(e => e.id === id);
}

/** Simple condition evaluator for gateway branching */
export function evaluateCondition(condition: string, variables: Record<string, any>): boolean {
  if (!condition) return true;
  try {
    // Unwrap the ${ ... } / #{ ... } expression wrapper.
    let expr = condition.trim().replace(/^[$#]\{/, '').replace(/\}$/, '').trim();

    // Substitute variable references with their JSON values, but never touch the
    // contents of string literals. split() keeps literals as odd-index segments.
    const parts = expr.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
    expr = parts.map((seg, i) => {
      if (i % 2 === 1) return seg; // string literal — leave verbatim
      return seg.replace(/[a-zA-Z_$][a-zA-Z0-9_$.]*/g, (tok) => {
        if (['true', 'false', 'null', 'undefined'].includes(tok)) return tok;
        if (tok === 'and') return '&&';
        if (tok === 'or')  return '||';
        if (tok === 'not') return '!';
        const root = tok.split('.')[0];
        if (Object.prototype.hasOwnProperty.call(variables, root)) {
          let val: any = variables[root];
          for (const p of tok.split('.').slice(1)) val = val == null ? val : val[p];
          return JSON.stringify(val ?? null);
        }
        return 'null'; // unknown identifier → null (condition simply won't match)
      });
    }).join('');

    // Evaluate via a safe parser (no JS runtime access) instead of new Function().
    return safeEvalBoolean(expr);
  } catch { /* malformed / unsupported expression → condition does not match */ }
  return false;
}
