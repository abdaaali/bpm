import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardActionArea, Avatar, Button } from '@mui/material';
import StoreIcon from '@mui/icons-material/Store';
import BugReportIcon from '@mui/icons-material/BugReport';
import SecurityIcon from '@mui/icons-material/Security';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import EngineeringIcon from '@mui/icons-material/Engineering';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PsychologyIcon from '@mui/icons-material/Psychology';
import StorageIcon from '@mui/icons-material/Storage';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
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
import WorkIcon from '@mui/icons-material/Work';
import { useAccess } from '../../auth/useAccess';
import { useAuth } from '../../auth/AuthContext';

export interface Tile { title: string; desc: string; icon: React.ReactNode; path: string; color: string; perm?: string; }

export const APPLICATIONS: Tile[] = [
  { title: 'Service Catalog', desc: 'Browse and raise service requests', icon: <StoreIcon />, path: '/catalog', color: '#1565c0', perm: 'cases:read' },
  { title: 'Service Operations', desc: 'Incidents, faults, problems, performance, changes', icon: <BugReportIcon />, path: '/cases?domain=service', color: '#c62828', perm: 'cases:read' },
  { title: 'Security Operations', desc: 'Theft cases and security audits', icon: <SecurityIcon />, path: '/cases?domain=security', color: '#6a1b9a', perm: 'cases:read' },
  { title: 'Field & Logistics', desc: 'Asset movements, convoys, spare parts', icon: <LocalShippingIcon />, path: '/cases?domain=field', color: '#f9a825', perm: 'cases:read' },
  { title: 'External Workforce', desc: 'Contractors, dispatch and reviews', icon: <EngineeringIcon />, path: '/contractors/companies', color: '#00838f', perm: 'contractors:read' },
  { title: 'Process Studio', desc: 'Design and publish BPMN processes', icon: <AccountTreeIcon />, path: '/processes', color: '#2e7d32', perm: 'processes:read' },
  { title: 'Root Cause Analysis', desc: 'RCA dashboards and taxonomy', icon: <PsychologyIcon />, path: '/rca', color: '#5d4037', perm: 'rca:read' },
  { title: 'Operational DataHub', desc: 'Sites, vendors, routes, calendars', icon: <StorageIcon />, path: '/admin/datahub', color: '#283593', perm: 'mdm:read' },
  { title: 'Governance', desc: 'Approval policies and controls', icon: <VerifiedUserIcon />, path: '/approvals/policies', color: '#37474f', perm: 'approvals:read' },
];

export const DASHBOARDS: Tile[] = [
  { title: 'Operational Dashboard', desc: 'Cross-platform KPIs and trends', icon: <DashboardIcon />, path: '/dashboard', color: '#1565c0', perm: 'analytics:read' },
  { title: 'Telecom Operations', desc: 'SLA, vendors, spares, security, workforce', icon: <InsightsIcon />, path: '/dashboard/operations', color: '#00838f', perm: 'cases:read' },
  { title: 'Process Performance', desc: 'Cycle time, bottlenecks, workload', icon: <BarChartIcon />, path: '/processes/analytics', color: '#2e7d32', perm: 'analytics:read' },
  { title: 'Report Generator', desc: 'Build, export and save custom CSV reports', icon: <AssessmentIcon />, path: '/reports', color: '#ad1457', perm: 'analytics:read' },
  { title: 'Management Digest', desc: 'Weekly governance digest — schedule & recipients', icon: <NotificationsIcon />, path: '/digest', color: '#00695c', perm: 'analytics:read' },
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
            <Card variant="outlined" sx={{ height: '100%', transition: 'box-shadow .15s, transform .15s', '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' } }}>
              <CardActionArea sx={{ p: 2.5, height: '100%' }} onClick={() => navigate(t.path)}>
                <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                  <Avatar variant="rounded" sx={{ bgcolor: t.color, width: 44, height: 44 }}>{t.icon}</Avatar>
                  <Typography variant="h6" fontWeight={700}>{t.title}</Typography>
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

export function ApplicationsPage() { return <TileGrid title="Applications" subtitle="Choose an area to work in" tiles={APPLICATIONS} />; }
export function DashboardsPage() { return <TileGrid title="Dashboards" subtitle="Operational insight across the platform" tiles={DASHBOARDS} />; }
export function AdministrationPage() { return <TileGrid title="Administration" subtitle="Platform configuration and master data" tiles={ADMINISTRATION} />; }

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <Box>
      <Box mb={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>{greeting}{user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}</Typography>
          <Typography variant="body2" color="text.secondary">Pick an application to get started, or jump to what needs your attention.</Typography>
        </Box>
        <Button variant="contained" size="large" startIcon={<WorkIcon />} onClick={() => navigate('/workplace')}>My Work</Button>
      </Box>
      <TileGrid title="Applications" tiles={APPLICATIONS} />
    </Box>
  );
}
