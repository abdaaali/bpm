/**
 * Next-Best-Action — the single source of truth for "what should I do next?"
 * across every work-item kind (case, task, request). Each list/detail surface
 * calls these instead of re-deriving status→action logic locally, so guidance
 * stays consistent everywhere.
 *
 * Each helper returns a NextAction descriptor; render it with <NextActionButton>.
 * The `to` route always points at the surface where the action is actually
 * performed (the detail page) — we deliberately do NOT duplicate mutations into
 * list rows, which is what caused the original redundancy.
 */

export type NextActionColor = 'primary' | 'success' | 'warning' | 'error' | 'inherit';

export interface NextAction {
  label: string;          // imperative verb, e.g. "Resolve", "Claim"
  color: NextActionColor;
  to: string;             // route where the action is performed
  terminal?: boolean;     // true ⇒ nothing to do (closed/cancelled) → render as a quiet link
}

// ── Case ───────────────────────────────────────────────────────────────────────
// Mirrors the per-type status flows used in CaseDetail.
export function caseNextAction(c: any): NextAction {
  const to = `/cases/${c.id}`;
  const t = c.type;
  switch (c.status) {
    case 'new':              return { label: 'Accept', color: 'primary', to };
    case 'open':             return { label: 'Begin Work', color: 'primary', to };
    case 'in_progress':      return (t === 'change' || t === 'request')
                               ? { label: 'Submit for Approval', color: 'primary', to }
                               : { label: 'Resolve', color: 'success', to };
    case 'pending':          return { label: 'Continue', color: 'primary', to };
    case 'pending_approval': return { label: 'Awaiting Approval', color: 'warning', to };
    case 'approved':         return { label: 'Implement', color: 'primary', to };
    case 'resolved':         return { label: 'Close', color: 'success', to };
    case 'closed':
    case 'cancelled':
    case 'rejected':         return { label: 'View', color: 'inherit', to, terminal: true };
    default:                 return { label: 'View', color: 'inherit', to };
  }
}

// ── Task / request-step ────────────────────────────────────────────────────────
export function taskNextAction(t: any, userId?: string): NextAction {
  const to = `/tasks/${t.id}`;
  const mine = t.assignee_id === userId;
  if (t.status === 'pending' && !t.assignee_id) return { label: 'Claim', color: 'primary', to };
  if (['pending', 'in_progress'].includes(t.status) && mine) return { label: 'Complete', color: 'success', to };
  if (['completed', 'cancelled'].includes(t.status)) return { label: 'View', color: 'inherit', to, terminal: true };
  return { label: 'View', color: 'inherit', to };
}

// ── Request (process instance) ──────────────────────────────────────────────────
export function requestNextAction(inst: any): NextAction {
  const to = `/requests/${inst.id}`;
  switch (inst.status) {
    case 'active':     return { label: 'Open', color: 'primary', to };
    case 'suspended':  return { label: 'On Hold', color: 'warning', to };
    case 'completed':  return { label: 'View', color: 'inherit', to, terminal: true };
    case 'terminated': return { label: 'View', color: 'inherit', to, terminal: true };
    default:           return { label: 'View', color: 'inherit', to };
  }
}
