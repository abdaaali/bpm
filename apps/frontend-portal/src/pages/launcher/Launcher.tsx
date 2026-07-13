import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardActionArea, Avatar, Button, ButtonBase } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StoreIcon from '@mui/icons-material/Store';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BugReportIcon from '@mui/icons-material/BugReport';
import PsychologyIcon from '@mui/icons-material/Psychology';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InsightsIcon from '@mui/icons-material/Insights';
import BarChartIcon from '@mui/icons-material/BarChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import PeopleIcon from '@mui/icons-material/People';
import DnsIcon from '@mui/icons-material/Dns';
import HubIcon from '@mui/icons-material/Hub';
import NotificationsIcon from '@mui/icons-material/Notifications';
import HistoryIcon from '@mui/icons-material/History';
import TimerIcon from '@mui/icons-material/Timer';
import { useAccess } from '../../auth/useAccess';
import { useAuth } from '../../auth/AuthContext';
import { useQuery } from 'react-query';
import { caseApi, approvalApi } from '../../api/client';
import { OPEN_CASE_STATUSES } from '../catalog/ServiceCatalog';
import KPIStatCard from '../../components/KPIStatCard';

export interface Tile { title: string; desc: string; icon: React.ReactNode; path: string; color: string; perm?: string; }

export const APPLICATIONS: Tile[] = [
  { title: 'Operations', desc: 'Service, IT, security and field & logistics cases — one place', icon: <ListAltIcon />, path: '/cases?domain=service', color: '#455a64', perm: 'cases:read' },
];

export const DASHBOARDS: Tile[] = [
  { title: 'Operational Dashboard', desc: 'Cross-platform KPIs and trends', icon: <DashboardIcon />, path: '/dashboard', color: '#1565c0', perm: 'analytics:read' },
  { title: 'Telecom Operations', desc: 'SLA, vendors, spares, security, workforce', icon: <InsightsIcon />, path: '/dashboard/operations', color: '#00838f', perm: 'cases:read' },
  { title: 'Process Performance', desc: 'Cycle time, bottlenecks, workload', icon: <BarChartIcon />, path: '/processes/analytics', color: '#2e7d32', perm: 'analytics:read' },
  { title: 'Report Generator', desc: 'Build, export and save custom CSV reports', icon: <AssessmentIcon />, path: '/reports', color: '#ad1457', perm: 'analytics:read' },
  { title: 'Management Digest', desc: 'Weekly governance digest — schedule & recipients', icon: <NotificationsIcon />, path: '/digest', color: '#00695c', perm: 'analytics:read' },
  { title: 'Root Cause Analysis', desc: 'RCA dashboards and taxonomy', icon: <PsychologyIcon />, path: '/rca', color: '#5d4037', perm: 'rca:read' },
];

export const ADMINISTRATION: Tile[] = [
  { title: 'Organization Structure', desc: 'Org units, users and positions', icon: <PeopleIcon />, path: '/org', color: '#1565c0', perm: 'org:read' },
  { title: 'Master Data', desc: 'Hosts and lookup reference data', icon: <DnsIcon />, path: '/mdm', color: '#5d4037', perm: 'mdm:read' },
  { title: 'SLA Policies', desc: 'Response / resolve targets and class multipliers', icon: <TimerIcon />, path: '/admin/sla', color: '#00838f', perm: 'cases:read' },
  { title: 'Integrations & Connectors', desc: 'REST / webhook / Kafka connectors', icon: <HubIcon />, path: '/admin/connectors', color: '#6a1b9a', perm: 'connectors:manage' },
  { title: 'Notification Templates', desc: 'Edit the messages the platform sends', icon: <NotificationsIcon />, path: '/admin/notification-templates', color: '#f9a825', perm: 'notifications:manage' },
  { title: 'Audit & Compliance', desc: 'Immutable activity trail', icon: <HistoryIcon />, path: '/audit', color: '#37474f', perm: 'audit:read' },
];

export function TileGrid({ title, subtitle, tiles }: { title: string; subtitle?: string; tiles: Tile[] }) {
  const navigate = useNavigate();
  const { can } = useAccess();
  const visible = tiles.filter((t) => can(t.perm));
  return (
    <Box>
      <Typography variant="h5" fontWeight={800}>{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" mb={3}>{subtitle}</Typography>}
      <Grid container spacing={2.5} mt={subtitle ? 0 : 1}>
        {visible.map((t) => (
          <Grid item xs={12} sm={6} md={4} key={t.title}>
            <Card sx={{
              height: '100%', position: 'relative', overflow: 'hidden',
              transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
              '&:hover': { boxShadow: '0 12px 28px rgba(15,23,42,0.14)', transform: 'translateY(-3px)', borderColor: `${t.color}55` },
              '&:hover .tile-arrow': { opacity: 1, transform: 'translateX(0)' },
            }}>
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: t.color }} />
              <CardActionArea sx={{ p: 2.75, height: '100%' }} onClick={() => navigate(t.path)}>
                <Box display="flex" alignItems="center" gap={1.5} mb={1.25}>
                  <Avatar variant="rounded" sx={{ bgcolor: t.color, width: 46, height: 46, boxShadow: `0 4px 12px ${t.color}4d` }}>{t.icon}</Avatar>
                  <Typography variant="h6" fontWeight={700} flex={1}>{t.title}</Typography>
                  <ChevronRightIcon className="tile-arrow" sx={{ color: t.color, opacity: 0, transform: 'translateX(-4px)', transition: 'opacity 200ms ease, transform 200ms ease' }} />
                </Box>
                <Typography variant="body2" color="text.secondary">{t.desc}</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
        {!visible.length && <Grid item xs={12}><Typography color="text.secondary">No items available for your role.</Typography></Grid>}
      </Grid>
    </Box>
  );
}

export function DashboardsPage() { return <TileGrid title="Dashboards" subtitle="Operational insight across the platform" tiles={DASHBOARDS} />; }

function WorkplaceSummary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: myWork = [] } = useQuery('my-work', caseApi.getMyWork);
  const { data: approvals } = useQuery('my-approvals', () => approvalApi.listPending(1, 50));
  const { data: myRequestsData } = useQuery(
    ['my-requests-count', user?.id],
    () => caseApi.list({ requesterId: user?.id, status: OPEN_CASE_STATUSES.join(',') }, 1, 1),
    { staleTime: 30_000, enabled: !!user },
  );

  const mineCases = (myWork as any[]).filter((c: any) => c.mine);
  const teamCases = (myWork as any[]).filter((c: any) => !c.mine);
  const toDoCount = mineCases.length + (approvals?.data?.length || 0);

  return (
    <Card sx={{ mb: 3 }}>
      <Box sx={{ p: 2.5 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" fontWeight={700}>My Workplace</Typography>
          <ButtonBase onClick={() => navigate('/workplace')} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main', borderRadius: 1, px: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>Go to My Workplace</Typography>
            <ChevronRightIcon fontSize="small" />
          </ButtonBase>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4} component={ButtonBase} onClick={() => navigate('/workplace?tab=todo')} sx={{ textAlign: 'inherit', borderRadius: 1 }}>
            <KPIStatCard label="To Do" value={toDoCount} color="#2856c9" />
          </Grid>
          <Grid item xs={12} sm={4} component={ButtonBase} onClick={() => navigate('/workplace?tab=requests')} sx={{ textAlign: 'inherit', borderRadius: 1 }}>
            <KPIStatCard label="My Requests" value={myRequestsData?.total ?? 0} color="#1b7a4a" />
          </Grid>
          <Grid item xs={12} sm={4} component={ButtonBase} onClick={() => navigate('/workplace?tab=team')} sx={{ textAlign: 'inherit', borderRadius: 1 }}>
            <KPIStatCard label="Team Queue" value={teamCases.length} color="#b5760f" />
          </Grid>
        </Grid>
      </Box>
    </Card>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = useAccess();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <Box>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>{greeting}{user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}</Typography>
          <Typography variant="body2" color="text.secondary">Pick an application to get started, or jump to what needs your attention.</Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button variant="outlined" size="large" startIcon={<StoreIcon />} onClick={() => navigate('/catalog')}>Service Request</Button>
          <Button variant="contained" size="large" startIcon={<BugReportIcon />} onClick={() => navigate('/cases/new')}>New Case</Button>
        </Box>
      </Box>
      <WorkplaceSummary />
      {APPLICATIONS.filter(t => can(t.perm)).map(t => (
        <Card key={t.title} sx={{
          position: 'relative', overflow: 'hidden', maxWidth: 420,
          transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
          '&:hover': { boxShadow: '0 12px 28px rgba(15,23,42,0.14)', transform: 'translateY(-3px)', borderColor: `${t.color}55` },
          '&:hover .tile-arrow': { opacity: 1, transform: 'translateX(0)' },
        }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: t.color }} />
          <CardActionArea sx={{ p: 2.75 }} onClick={() => navigate(t.path)}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1.25}>
              <Avatar variant="rounded" sx={{ bgcolor: t.color, width: 46, height: 46, boxShadow: `0 4px 12px ${t.color}4d` }}>{t.icon}</Avatar>
              <Typography variant="h6" fontWeight={700} flex={1}>{t.title}</Typography>
              <ChevronRightIcon className="tile-arrow" sx={{ color: t.color, opacity: 0, transform: 'translateX(-4px)', transition: 'opacity 200ms ease, transform 200ms ease' }} />
            </Box>
            <Typography variant="body2" color="text.secondary">{t.desc}</Typography>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
