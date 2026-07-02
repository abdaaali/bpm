/**
 * useTaskActions — the single source of truth for the "act on a workflow task"
 * contract: claim / complete / reject / reassign, plus a shared action-error
 * state. Both the inline case panel (ProcessActionPanel) and the standalone
 * task/request page (WorkItemDetail) consume this, so the orchestrator
 * completion contract (`{outcome, variables}`, reject = outcome:'rejected' with
 * a rejectionReason) lives in exactly one place.
 *
 * The hook owns the mutations and error; the caller supplies `onChanged` (run
 * after any successful action — typically cache invalidation, since query keys
 * differ per consumer) and may pass a per-call `{ onSuccess }` to mutate() to
 * close its own dialogs. Loading flags are read off each returned mutation
 * (e.g. `complete.isLoading`).
 */
import { useState } from 'react';
import { useMutation } from 'react-query';
import { processApi, taskReassign } from '../../api/client';

export function useTaskActions(taskId: string | undefined, opts: { onChanged?: () => void } = {}) {
  const [error, setError] = useState('');
  const handlers = {
    onSuccess: () => { setError(''); opts.onChanged?.(); },
    onError: (e: any) => setError(e.response?.data?.message || e.message),
  };

  const claim = useMutation(() => processApi.claimTask(taskId!), handlers);
  const complete = useMutation(
    (variables?: any) => processApi.completeTask(taskId!, { outcome: 'completed', variables }),
    handlers,
  );
  const reject = useMutation(
    (p: { variables?: any; reason?: string }) =>
      processApi.completeTask(taskId!, { outcome: 'rejected', variables: { ...(p.variables || {}), rejectionReason: p.reason } }),
    handlers,
  );
  const reassign = useMutation((userId: string) => taskReassign(taskId!, userId), handlers);

  return { claim, complete, reject, reassign, error, setError };
}
