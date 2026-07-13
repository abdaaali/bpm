import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/**
 * Centralized back-navigation control for nested/detail pages.
 *
 * Always navigates to an explicit, deterministic parent route — never browser
 * history (`navigate(-1)`). This is intentional: every one of this app's
 * detail pages (case, process instance, work item, Process Studio, ...) is
 * directly linkable and gets opened by URL as often as by clicking through
 * from a list, so a history-based back would silently do nothing (or leave
 * the app) whenever there's no in-app navigation history to go back to.
 * A fixed `to` route works identically either way.
 */
export default function BackButton({ to, label, sx }: { to: string; label: string; sx?: object }) {
  const navigate = useNavigate();
  return (
    <Tooltip title={label}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate(to)} sx={sx} aria-label={label}>
        {label}
      </Button>
    </Tooltip>
  );
}
