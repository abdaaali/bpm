/**
 * Single source of truth for case/process/priority chip colors — previously
 * duplicated independently across CaseList.tsx, ProcessInstances.tsx, and
 * 10 other files. Same values as were already live in CaseList.tsx/
 * ProcessInstances.tsx; only consolidated so future changes happen in one place.
 */
export type MuiChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

export const CASE_TYPE_COLORS: Record<string, MuiChipColor> = {
  incident: 'error', problem: 'warning', change: 'info', request: 'success', alarm: 'secondary',
};

export const CASE_PRIORITY_COLORS: Record<string, MuiChipColor> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

export const CASE_STATUS_COLORS: Record<string, MuiChipColor> = {
  new: 'info', open: 'primary', in_progress: 'warning', resolved: 'success',
  closed: 'default', cancelled: 'default', pending_approval: 'secondary',
};

export const PROCESS_INSTANCE_STATUS_COLORS: Record<string, MuiChipColor> = {
  active: 'primary', completed: 'success', suspended: 'warning', terminated: 'error',
};
