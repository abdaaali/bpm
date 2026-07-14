import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ListAltIcon from '@mui/icons-material/ListAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import ToDo from './ToDo';
import MyRequests from '../catalog/MyRequests';
import TeamQueue from './TeamQueue';
import { caseApi } from '../../api/client';
import { useAccess } from '../../auth/useAccess';
import BackButton from '../../components/BackButton';

// Unified personal cockpit, framed around the end user's three questions:
//   To Do        — what needs my action (assigned cases + approvals)
//   My Requests  — status of what I raised
//   Team Queue   — unclaimed work I can pick up (role-adaptive)
export default function Workplace() {
  const [params, setParams] = useSearchParams();
  const { can } = useAccess();

  // Drives whether the Team Queue tab is offered. Deliberately NOT data-dependent
  // (some unclaimed case existing right now) — a role that does team-pool work
  // should always see its queue, even when it's currently empty; hiding the tab
  // whenever the queue happens to be empty made it look broken/disappearing.
  // tasks:claim is the actual signal for "this role claims pool work" (also true
  // for cases:assign roles, who see it as managers of the queue).
  // Kept as a query (result unused here) to keep the 'my-work' cache warm for
  // ToDo/TeamQueue, which read the same key.
  useQuery('my-work', caseApi.getMyWork);
  const showTeamQueue = can('cases:assign') || can('tasks:claim');

  const TABS = [
    { key: 'todo',     label: 'To Do',       icon: <AssignmentIcon />, render: () => <ToDo /> },
    { key: 'requests', label: 'My Requests', icon: <ListAltIcon />,    render: () => <MyRequests /> },
    ...(showTeamQueue
      ? [{ key: 'team', label: 'Team Queue', icon: <GroupsIcon />, render: () => <TeamQueue /> }]
      : []),
  ];

  // 'tasks' kept as a legacy alias for the old default tab.
  const requested = params.get('tab');
  const current = requested === 'tasks' ? 'todo' : (requested || 'todo');
  const idx = Math.max(0, TABS.findIndex(t => t.key === current));
  const active = TABS[idx] || TABS[0];

  return (
    <Box>
      <BackButton to="/home" label="Back to Home" sx={{ mb: 1 }} />
      <Typography variant="h4" fontWeight={700} gutterBottom>My Workplace</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What needs your action, the requests you raised, and work you can pick up — in one place.
      </Typography>

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={idx} onChange={(_, v) => setParams({ tab: TABS[v].key })} variant="scrollable" scrollButtons="auto">
          {TABS.map(t => (
            <Tab key={t.key} icon={t.icon} iconPosition="start" label={t.label} sx={{ minHeight: 56 }} />
          ))}
        </Tabs>
      </Paper>

      <Box>{active.render()}</Box>
    </Box>
  );
}
