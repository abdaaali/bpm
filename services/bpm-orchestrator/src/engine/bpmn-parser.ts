/**
 * Lightweight BPMN 2.0 XML parser.
 * Namespace-agnostic: detects the actual xmlns prefix bound to each vendor
 * namespace URI rather than assuming a fixed prefix (e.g. "flowable:").
 */
import { safeEvalBoolean } from './safe-expr';

// ── Namespace URIs ──────────────────────────────────────────────────────────
const NS_FLOWABLE = 'http://flowable.org/bpmn';
const NS_CAMUNDA  = 'http://activiti.org/bpmn';          // also used by Camunda 7
const NS_CAMUNDA2 = 'http://camunda.org/schema/1.0/bpmn';

/** Return the xmlns prefix bound to a given URI in the document, or fallback. */
function findPrefix(xml: string, uri: string, fallback: string): string {
  const escaped = uri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = xml.match(new RegExp(`xmlns:([a-zA-Z0-9_]+)="${escaped}"`));
  return m ? m[1] : fallback;
}

interface Prefixes {
  flowable: string;
  camunda: string;
  bpm: string;
}

function extractPrefixes(xml: string): Prefixes {
  return {
    flowable: findPrefix(xml, NS_FLOWABLE,  'flowable'),
    camunda:  findPrefix(xml, NS_CAMUNDA,   'camunda') !== 'camunda'
              ? findPrefix(xml, NS_CAMUNDA,  'camunda')
              : findPrefix(xml, NS_CAMUNDA2, 'camunda'),
    bpm:      findPrefix(xml, 'http://bpm', 'bpm'),
  };
}

// ── Public interfaces ────────────────────────────────────────────────────────
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
  config?: Record<string, any>;
  formFields?: FormField[];
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

// ── Internal helpers ─────────────────────────────────────────────────────────
function extractAttr(tag: string, attr: string): string | undefined {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
}

/** Try multiple prefix alternatives for the same logical attribute. */
function extractAttrAny(tag: string, localName: string, ...prefixes: string[]): string | undefined {
  for (const pfx of prefixes) {
    if (!pfx) continue;
    const v = extractAttr(tag, `${pfx}:${localName}`);
    if (v !== undefined) return v;
  }
  return undefined;
}

function extractExtensionValue(xml: string, elementId: string, prop: string, pfx: Prefixes): string | undefined {
  const pfxPattern = [pfx.camunda, pfx.flowable, pfx.bpm, 'camunda', 'flowable', 'bpm']
    .filter((p, i, a) => p && a.indexOf(p) === i)
    .join('|');
  const re = new RegExp(
    `id="${elementId}"[^>]*>[\\s\\S]*?<(?:${pfxPattern}):property\\s+name="${prop}"\\s+value="([^"]*)"`,
    'i',
  );
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

// ── Main parser ──────────────────────────────────────────────────────────────
export function parseBpmn(xml: string): BpmnProcess {
  const pfx = extractPrefixes(xml);
  const elements: BpmnElement[] = [];
  const flows: BpmnFlow[] = [];
  const warnings: string[] = [];
  let processId = 'process';
  let processName = 'Unnamed Process';
  let initiatorVariableName: string | undefined;

  // Extract process id/name
  const procMatch = xml.match(new RegExp('<(?:bpmn2?:)?process\\s([^>]*)>', 'i'));
  if (procMatch) {
    processId   = extractAttr(procMatch[1], 'id')   || processId;
    processName = extractAttr(procMatch[1], 'name') || processName;
  }

  // Element types to parse
  const elementTypes = [
    'startEvent', 'endEvent',
    'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'receiveTask', 'sendTask',
    'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway',
    'intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent',
    'subProcess', 'callActivity',
  ];

  for (const type of elementTypes) {
    const re = new RegExp(`<(?:bpmn2?:)?${type}\\s([^>]*?)(?:/>|>)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const tag = m[1];
      const id = extractAttr(tag, 'id');
      if (!id) continue;

      const el: BpmnElement = {
        id,
        type,
        name:     extractAttr(tag, 'name'),
        assignee: extractAttrAny(tag, 'assignee', pfx.camunda, pfx.flowable),
        formKey:  extractAttrAny(tag, 'formKey',  pfx.camunda, pfx.flowable),
      };

      // flowable:initiator on startEvent → process-level metadata, NOT assignee
      if (type === 'startEvent') {
        const initiator = extractAttrAny(tag, 'initiator', pfx.flowable, pfx.camunda);
        if (initiator) initiatorVariableName = initiator;
      }

      // candidateGroups
      const cg = extractAttrAny(tag, 'candidateGroups', pfx.camunda, pfx.flowable);
      if (cg) el.candidateGroups = cg.split(',').map(s => s.trim()).filter(Boolean);

      // candidateUsers (Flowable)
      const cu = extractAttrAny(tag, 'candidateUsers', pfx.flowable, pfx.camunda);
      if (cu) el.candidateUsers = cu.split(',').map(s => s.trim()).filter(Boolean);

      // slaHours — direct attribute or extension element
      const slaAttr = extractAttrAny(tag, 'slaHours', pfx.camunda, pfx.flowable, pfx.bpm);
      if (slaAttr) {
        el.slaHours = parseFloat(slaAttr);
      } else {
        const slaExt = extractExtensionValue(xml, id, 'slaHours', pfx);
        if (slaExt) el.slaHours = parseFloat(slaExt);
      }

      // serviceType — direct attribute or extension element
      const svcAttr = extractAttrAny(tag, 'serviceType', pfx.camunda, pfx.flowable, pfx.bpm);
      if (svcAttr) {
        el.serviceType = svcAttr;
      } else {
        const svcExt = extractExtensionValue(xml, id, 'serviceType', pfx);
        if (svcExt) el.serviceType = svcExt;
      }

      // formFields — URL-encoded JSON array (platform-native format).
      // Accept either prefix literally (Process Studio writes `camunda:`, the
      // launch BPMN authored with `activiti:`) regardless of how the namespace
      // prefix resolves, so both authoring paths round-trip.
      const ffRaw = extractAttrAny(tag, 'formFields', pfx.camunda, pfx.flowable, pfx.bpm, 'camunda', 'activiti');
      if (ffRaw) {
        try { el.formFields = JSON.parse(decodeURIComponent(ffRaw)); } catch { /* ignore malformed */ }
      }

      // Fallback: parse <flowable:formProperty> / <camunda:formProperty> extension elements
      // (standard Flowable Studio / Camunda Modeler export format)
      if (!el.formFields?.length && (type === 'userTask' || type === 'startEvent')) {
        const pfxPat = [pfx.flowable, pfx.camunda, 'flowable', 'camunda']
          .filter((p, i, a) => p && a.indexOf(p) === i).join('|');
        // Extract the XML block for this element (open tag to close tag)
        const blockRe = new RegExp(
          `<(?:bpmn2?:)?${type}\\s[^>]*id="${id}"[\\s\\S]*?</(?:bpmn2?:)?${type}>`,
          'i',
        );
        const blockMatch = xml.match(blockRe);
        if (blockMatch) {
          const block = blockMatch[0];
          const fields: FormField[] = [];
          // Match both self-closing and element-with-children formProperty
          const fpRe = new RegExp(
            `<(?:${pfxPat}):formProperty\\s([^>]*?)(?:/>|>([\\s\\S]*?)</(?:${pfxPat}):formProperty>)`,
            'gi',
          );
          let fp: RegExpExecArray | null;
          while ((fp = fpRe.exec(block)) !== null) {
            const attrs = fp[1];
            const body  = fp[2] || '';
            const fid   = extractAttr(attrs, 'id') || '';
            if (!fid) continue;
            const fname    = extractAttr(attrs, 'name') || fid;
            const ftype    = extractAttr(attrs, 'type') || 'string';
            const frequired = extractAttr(attrs, 'required') === 'true';
            // Map Flowable / Camunda types → platform field types
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
            // For enum: extract <flowable:value id="..." name="..."/> children as options
            if (ftype === 'enum' && body) {
              const valRe = new RegExp(
                `<(?:${pfxPat}):value\\s[^>]*(?:id="([^"]*)"[^>]*name="([^"]*)"|name="([^"]*)"[^>]*id="([^"]*)")`,
                'gi',
              );
              const opts: string[] = [];
              let vMatch: RegExpExecArray | null;
              while ((vMatch = valRe.exec(body)) !== null) {
                // id is in group 1 or 4, name in group 2 or 3 (attribute order varies)
                const optId    = (vMatch[1] || vMatch[4] || '').trim();
                const optLabel = (vMatch[2] || vMatch[3] || '').trim();
                // Emit "id:label" so the form submits the id (which gateway
                // conditions compare against) while showing the friendly label.
                // Fall back to a single token when id and label are absent/equal.
                if (optId && optLabel && optId !== optLabel) opts.push(`${optId}:${optLabel}`);
                else if (optId || optLabel) opts.push(optId || optLabel);
              }
              if (opts.length) field.options = opts.join(',');
            }
            fields.push(field);
          }
          if (fields.length) el.formFields = fields;
        }
      }

      // scriptContent + scriptFormat for scriptTask
      if (type === 'scriptTask') {
        const fmtAttr = extractAttrAny(tag, 'scriptFormat', pfx.flowable, pfx.camunda);
        if (fmtAttr) el.scriptFormat = fmtAttr;
        // Inline script body: <bpmn:script> or <flowable:script>
        const scriptBodyRe = new RegExp(
          `id="${id}"[\\s\\S]*?<(?:bpmn2?:|${pfx.flowable}:|${pfx.camunda}:)?script[^>]*>([^<]+)<`,
          'i',
        );
        const sm = xml.match(scriptBodyRe);
        if (sm) el.scriptContent = sm[1].trim();
      }

      // serviceExpression — Flowable delegate/expression/class on serviceTask
      if (type === 'serviceTask') {
        const expr =
          extractAttrAny(tag, 'expression',         pfx.flowable, pfx.camunda) ||
          extractAttrAny(tag, 'delegateExpression', pfx.flowable, pfx.camunda) ||
          extractAttrAny(tag, 'class',              pfx.flowable, pfx.camunda);
        if (expr) {
          el.serviceExpression = expr;
          // Warn: this delegate/expression requires a matching bean/class in the runtime
          const hint = expr.startsWith('${') || expr.startsWith('#{')
            ? `Service task "${el.name || id}" uses expression "${expr}" which requires a matching bean at runtime.`
            : `Service task "${el.name || id}" uses delegate class "${expr}" which must be on the engine classpath.`;
          warnings.push(hint);
        }
      }

      elements.push(el);
    }
  }

  // Sequence flows
  const flowRe = new RegExp('<(?:bpmn2?:)?sequenceFlow\\s([^>]*?)(?:/>|>)', 'gi');
  let fm: RegExpExecArray | null;
  while ((fm = flowRe.exec(xml)) !== null) {
    const tag = fm[1];
    const id     = extractAttr(tag, 'id');
    const source = extractAttr(tag, 'sourceRef');
    const target = extractAttr(tag, 'targetRef');
    if (!id || !source || !target) continue;
    const flow: BpmnFlow = { id, source, target, name: extractAttr(tag, 'name') };
    const condMatch = xml.match(new RegExp(`id="${id}"[\\s\\S]*?<(?:bpmn2?:)?conditionExpression[^>]*>([^<]*)<`));
    if (condMatch) flow.condition = condMatch[1].trim();
    flows.push(flow);
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

/** Get outgoing flows from a given element */
export function getOutgoingFlows(process: BpmnProcess, elementId: string): BpmnFlow[] {
  return process.flows.filter(f => f.source === elementId);
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
