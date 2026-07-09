import React from 'react';
import { Assignment, CheckCircle, HourglassBottom, Warning, Schedule, TrendingUp } from '@mui/icons-material';

/**
 * Single source of truth for work-order priority/status colors — previously
 * duplicated verbatim in Dashboard.tsx and WorkOrderList.tsx. Same values,
 * same behavior; only consolidated so future changes happen in one place.
 * Red stays reserved for genuinely urgent states (critical priority, rework
 * required) — never used decoratively.
 */
export const PRIORITY_COLORS: Record<string, string> = {
  critical: '#d32f2f', high: '#f57c00', medium: '#f9a825', low: '#388e3c',
};

export const STATUS_META: Record<string, { label: string; color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'; icon: React.ReactNode }> = {
  pending: { label: 'Awaiting Acceptance', color: 'warning', icon: <Assignment fontSize="small" /> },
  accepted: { label: 'Accepted', color: 'info', icon: <Schedule fontSize="small" /> },
  in_progress: { label: 'In Progress', color: 'primary', icon: <HourglassBottom fontSize="small" /> },
  submitted: { label: 'Pending Review', color: 'secondary', icon: <TrendingUp fontSize="small" /> },
  rework_required: { label: 'Rework Required', color: 'error', icon: <Warning fontSize="small" /> },
  closed: { label: 'Closed', color: 'success', icon: <CheckCircle fontSize="small" /> },
  rejected: { label: 'Rejected', color: 'default', icon: null },
};

export function statusMeta(status: string) {
  return STATUS_META[status] || { label: status, color: 'default' as const, icon: null };
}

/** sx for a priority Chip: tinted background + solid text in the priority color. */
export function priorityChipSx(priority: string) {
  const c = PRIORITY_COLORS[priority] || '#757575';
  return { bgcolor: `${c}20`, color: c, fontWeight: 600, textTransform: 'capitalize' as const };
}
