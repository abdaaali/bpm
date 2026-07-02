import React from 'react';
import { Button } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { NextAction } from '../lib/nextAction';

/**
 * Renders a work item's next-best-action as a single primary button.
 * Terminal actions (closed/cancelled) render as a quiet text link instead of a
 * call-to-action, so finished work doesn't shout for attention.
 */
export default function NextActionButton(
  { action, size = 'small' }: { action: NextAction; size?: 'small' | 'medium' },
) {
  const navigate = useNavigate();
  const go = (e: React.MouseEvent) => { e.stopPropagation(); navigate(action.to); };

  if (action.terminal) {
    return (
      <Button size={size} color="inherit" onClick={go} sx={{ color: 'text.secondary' }}>
        {action.label}
      </Button>
    );
  }

  return (
    <Button
      variant="contained"
      size={size}
      color={action.color === 'inherit' ? 'primary' : action.color}
      endIcon={<ArrowForwardIcon fontSize="small" />}
      onClick={go}
    >
      {action.label}
    </Button>
  );
}
