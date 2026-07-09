import React from 'react';
import { Box, Typography, CircularProgress, Chip } from '@mui/material';

/**
 * Hover/press treatment for cards that are actually clickable (Connect mode
 * cards, Home list rows) — deliberately NOT applied globally via theme.ts, so
 * static/informational cards (detail-page info panels, stat tiles) don't look
 * clickable when they aren't. Spread into a Card's `sx` prop.
 */
export const clickableCardSx = {
  cursor: 'pointer',
  transition: 'box-shadow 200ms ease, transform 200ms ease',
  '&:hover': { boxShadow: '0 14px 32px rgba(15,23,42,0.16)', transform: 'translateY(-3px)' },
  '&:active': { transform: 'translateY(-1px) scale(0.99)' },
} as const;

// Shared status/priority color mapping — replaces the 3 separate ad-hoc maps
// that used to live in Home.tsx (CasesTab, InsightsTab) and CaseDetail.tsx.
const PRIORITY_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error', high: 'warning', medium: 'info', low: 'default',
};

export function PriorityChip({ value, size = 'small' }: { value?: string; size?: 'small' | 'medium' }) {
  if (!value) return null;
  return (
    <Chip size={size} label={value} color={PRIORITY_COLOR[value] || 'default'}
      sx={{ height: size === 'small' ? 20 : 24, fontWeight: 700, textTransform: 'capitalize' }} />
  );
}

/** Generic lifecycle status chip: case/task/work-order/approval statuses all funnel through the same palette. */
export function StatusChip({ value, size = 'small', variant }: { value?: string; size?: 'small' | 'medium'; variant?: 'filled' | 'outlined' }) {
  if (!value) return null;
  const v = String(value).toLowerCase();
  const label = String(value).replace(/_/g, ' ');
  let color: 'success' | 'warning' | 'error' | 'info' | 'default' = 'default';
  if (['resolved', 'closed', 'completed', 'approved', 'accepted'].includes(v)) color = 'success';
  else if (['in_progress', 'pending', 'pending_approval', 'assigned'].includes(v)) color = 'info';
  else if (['breached', 'rejected', 'overdue', 'cancelled'].includes(v)) color = 'error';
  else if (['at_risk', 'on_hold', 'paused'].includes(v)) color = 'warning';
  return (
    <Chip size={size} label={label} color={color} variant={variant ?? (color === 'default' ? 'outlined' : 'filled')}
      sx={{ height: size === 'small' ? 20 : 24, fontWeight: 600, textTransform: 'capitalize' }} />
  );
}

/** SLA due/overdue chip — shared date-to-chip logic (was duplicated across CasesTab, InsightsTab, CaseDetail). */
export function dueChipProps(entity: { breached?: boolean; sla_at_risk?: boolean; sla_due_at?: string }): { text: string; color: 'error' | 'warning' | 'default' } | null {
  if (entity.breached) return { text: 'overdue', color: 'error' };
  if (entity.sla_at_risk) return { text: 'at risk', color: 'warning' };
  if (!entity.sla_due_at) return null;
  const h = Math.round((new Date(entity.sla_due_at).getTime() - Date.now()) / 3.6e6);
  if (h <= 0) return { text: 'overdue', color: 'error' };
  return { text: h < 24 ? `due ${h}h` : `due ${Math.round(h / 24)}d`, color: 'default' };
}

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
      {icon && <Box sx={{ fontSize: 40, mb: 1, color: 'text.disabled', display: 'flex', justifyContent: 'center' }}>{icon}</Box>}
      <Typography variant="body1" fontWeight={600}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>}
    </Box>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, gap: 1.5 }}>
      <CircularProgress size={32} />
      {label && <Typography variant="body2" color="text.secondary">{label}</Typography>}
    </Box>
  );
}
