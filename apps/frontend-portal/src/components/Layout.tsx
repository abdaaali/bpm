import React, { useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Divider, Badge, Avatar, Menu, MenuItem, Tooltip,
  Collapse, Popover, TextField, InputAdornment, Button,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import WorkIcon from '@mui/icons-material/Work';
import HomeIcon from '@mui/icons-material/Home';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import MonitorIcon from '@mui/icons-material/Monitor';
import BarChartIcon from '@mui/icons-material/BarChart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import PsychologyIcon from '@mui/icons-material/Psychology';
import NotificationsIcon from '@mui/icons-material/Notifications';
import StoreIcon from '@mui/icons-material/Store';
import EngineeringIcon from '@mui/icons-material/Engineering';
import GroupsIcon from '@mui/icons-material/Groups';
import AssignmentIcon from '@mui/icons-material/Assignment';
import RateReviewIcon from '@mui/icons-material/RateReview';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import PolicyIcon from '@mui/icons-material/Policy';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import HubIcon from '@mui/icons-material/Hub';
import BugReportIcon from '@mui/icons-material/BugReport';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import BuildIcon from '@mui/icons-material/Build';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SecurityIcon from '@mui/icons-material/Security';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useAuth } from '../auth/AuthContext';
import { useAccess } from '../auth/useAccess';
import ModuleNav from './ModuleNav';
import EmptyState from './EmptyState';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { notifApi } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

const DRAWER_WIDTH = 220;

// Launcher-model navigation: a slim rail of top-level destinations. Functional
// areas are opened from the Applications / Dashboards / Administration pages
// (tile launchers) rather than nested sidebar sections.
interface NavChild { label: string; path: string; perm?: string; }
interface NavItem { label: string; icon: React.ReactNode; path: string; match: string[]; perm?: string; children?: NavChild[]; }

const NAV: NavItem[] = [
  { label: 'Home', icon: <HomeIcon />, path: '/home', match: ['/home', '/catalog', '/cases'] },
  { label: 'My Work', icon: <WorkIcon />, path: '/workplace', match: ['/workplace', '/inbox', '/tasks', '/requests', '/my-requests'],
    children: [
      { label: 'To Do', path: '/workplace?tab=todo' },
      { label: 'My Requests', path: '/workplace?tab=requests' },
      { label: 'Team Queue', path: '/workplace?tab=team' },
    ] },
  { label: 'Dashboards', icon: <DashboardIcon />, path: '/dashboards', match: ['/dashboards', '/dashboard', '/reports', '/digest', '/rca'], perm: 'cases:read',
    children: [
      { label: 'Operational Dashboard', path: '/dashboard' },
      { label: 'Telecom Operations', path: '/dashboard/operations' },
      { label: 'Process Performance', path: '/processes/analytics', perm: 'processes:read' },
      { label: 'Report Generator', path: '/reports', perm: 'analytics:read' },
      { label: 'Management Digest', path: '/digest', perm: 'analytics:read' },
      { label: 'Root Cause Analysis', path: '/rca', perm: 'rca:read' },
    ] },
  { label: 'Administration', icon: <SettingsIcon />, path: '/admin', match: ['/admin', '/org', '/mdm', '/audit', '/approvals'], perm: 'org:read',
    children: [
      { label: 'Organization', path: '/org' },
      { label: 'Master Data', path: '/mdm', perm: 'mdm:read' },
      { label: 'SLA Policies', path: '/admin/sla' },
      { label: 'Integrations', path: '/admin/connectors', perm: 'connectors:manage' },
      { label: 'Notification Templates', path: '/admin/notification-templates', perm: 'notifications:manage' },
      { label: 'Audit & Compliance', path: '/audit', perm: 'audit:read' },
      { label: 'Operational DataHub', path: '/admin/datahub', perm: 'mdm:read' },
      { label: 'Approval Policies', path: '/approvals/policies', perm: 'approvals:read' },
      { label: 'Approval Instances', path: '/approvals/instances', perm: 'approvals:read' },
    ] },
  { label: 'External Workforce', icon: <EngineeringIcon />, path: '/contractors/companies', match: ['/contractors'], perm: 'contractors:read',
    children: [
      { label: 'Companies', path: '/contractors/companies' },
      { label: 'External Workers', path: '/contractors/users' },
      { label: 'Dispatch', path: '/contractors/dispatch' },
      { label: 'Submission Review', path: '/contractors/review' },
      { label: 'Performance & KPIs', path: '/contractors/dashboard' },
    ] },
  { label: 'Process Studio', icon: <AccountTreeIcon />, path: '/processes', match: ['/processes'], perm: 'processes:read',
    children: [
      { label: 'Studio', path: '/processes' },
      { label: 'Process Monitor', path: '/processes/instances' },
      { label: 'Process Performance', path: '/processes/analytics' },
    ] },
];

const COLLAPSE_KEY = 'bpm_nav_collapsed_sections';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
  });

  // Notifications for the header popover (loaded only while open).
  const { data: notifList } = useQuery('notif-popover', () => notifApi.list(false, 1), { enabled: !!notifAnchor });
  const markAllRead = useMutation(() => notifApi.markRead([]), {
    onSuccess: () => { qc.invalidateQueries('notifCount'); qc.invalidateQueries('notif-popover'); },
  });

  const runSearch = () => {
    const q = search.trim();
    if (!q) return;
    setSearch('');
    navigate(`/cases?search=${encodeURIComponent(q)}`);
  };
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { can } = useAccess();

  const toggleSection = (label: string) => {
    setExpanded(prev => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const { data: notifCount } = useQuery('notifCount', () => notifApi.count(), {
    refetchInterval: 30_000, enabled: !!user,
  });

  // A top-level nav item is active when the current path is the item's path or
  // starts with any of its `match` prefixes (so working inside a functional area
  // keeps "Applications" highlighted).
  const isSelected = (item: NavItem) =>
    item.match.some(m => location.pathname === m || location.pathname.startsWith(m + '/') || location.pathname.startsWith(m + '?') || location.pathname === m);

  const isChildActive = (c: NavChild) => {
    const [p, q] = c.path.split('?');
    return q ? (location.pathname === p && location.search === `?${q}`)
              : (location.pathname === p || location.pathname.startsWith(p + '/'));
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(!open)} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Box component="img" src="/favicon.svg" alt="" aria-hidden="true" sx={{ width: 28, height: 28, mr: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 3 }}>
            BPM Portal
          </Typography>
          <TextField
            size="small" placeholder="Search cases…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
            sx={{
              flexGrow: 1, maxWidth: 420, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 2,
              transition: 'background-color 160ms ease, box-shadow 160ms ease',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              '&:focus-within': { bgcolor: 'rgba(255,255,255,0.24)', boxShadow: '0 0 0 2px rgba(255,255,255,0.4)' },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '& input': { color: 'inherit' }, '& input::placeholder': { color: 'rgba(255,255,255,0.85)', opacity: 1 },
            }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'inherit' }} fontSize="small" /></InputAdornment> }}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Notifications">
            <IconButton color="inherit" onClick={e => setNotifAnchor(e.currentTarget)}>
              <Badge badgeContent={notifCount?.count || 0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Popover
            open={Boolean(notifAnchor)} anchorEl={notifAnchor} onClose={() => setNotifAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Box sx={{ width: 360, maxHeight: 440, overflow: 'auto' }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={1.5} sx={{ bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                <Button size="small" onClick={() => markAllRead.mutate()} disabled={markAllRead.isLoading}>Mark all read</Button>
              </Box>
              <Divider />
              {(notifList?.data || []).length === 0 && (
                <EmptyState icon={<NotificationsIcon fontSize="inherit" />} title="You're all caught up" description="New notifications will show up here." />
              )}
              {(notifList?.data || []).map((n: any) => (
                <Box key={n.id} px={2} py={1.25} sx={{
                  borderBottom: '1px solid', borderColor: 'divider',
                  bgcolor: n.read_at ? 'transparent' : 'action.hover',
                  transition: 'background-color 160ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Typography variant="body2" fontWeight={n.read_at ? 400 : 600}>{n.subject}</Typography>
                  {n.body && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} dangerouslySetInnerHTML={{ __html: n.body }} />}
                  <Typography variant="caption" color="text.secondary">
                    {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Popover>
          <Tooltip title={user?.name || 'User'}>
            <IconButton onClick={e => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 14 }}>
                {(user?.name || 'U')[0].toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { minWidth: 220 } }}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" fontWeight={700}>{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={logout} sx={{ py: 1.25 }}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="persistent"
        open={open}
        sx={{
          width: open ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', py: 1 }}>
          <List>
            {NAV.filter(item => can(item.perm)).map(item => {
              const active = isSelected(item);
              const children = (item.children || []).filter(c => can(c.perm));
              const hasChildren = children.length > 0;
              const isOpen = expanded[item.label] ?? active;
              return (
                <ListItem key={item.path} disablePadding sx={{ display: 'block' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ListItemButton
                      selected={active}
                      component={RouterLink}
                      to={item.path}
                      onClick={() => { if (hasChildren) setExpanded(prev => ({ ...prev, [item.label]: true })); }}
                      sx={{
                        borderRadius: 2, mx: 1, my: 0.25, py: 1.25, flex: 1, position: 'relative', pl: active ? 2.25 : 2,
                        '&:hover': { bgcolor: active ? 'rgba(40,86,201,0.14)' : 'rgba(15,23,42,0.045)' },
                        '&.Mui-selected': {
                          bgcolor: 'rgba(40,86,201,0.1)', color: 'primary.main',
                          '& .MuiListItemIcon-root': { color: 'primary.main' },
                          '&::before': {
                            content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
                            borderRadius: 3, bgcolor: 'primary.main',
                          },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary', transition: 'color 160ms ease' }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 15, fontWeight: active ? 700 : 600 }} />
                    </ListItemButton>
                    {hasChildren && (
                      <IconButton size="small" onClick={() => toggleSection(item.label)} sx={{ mr: 1 }}
                        aria-label={isOpen ? `Collapse ${item.label}` : `Expand ${item.label}`}>
                        {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    )}
                  </Box>
                  {hasChildren && (
                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                      <List component="div" disablePadding dense>
                        {children.map(c => {
                          const childActive = isChildActive(c);
                          return (
                            <ListItemButton key={c.path} component={RouterLink} to={c.path} selected={childActive}
                              sx={{
                                pl: 6.5, py: 0.75, borderRadius: 2, mx: 1, my: 0.15,
                                '&.Mui-selected': { bgcolor: 'rgba(40,86,201,0.08)', color: 'primary.main' },
                              }}>
                              <ListItemText primary={c.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: childActive ? 700 : 500 }} />
                            </ListItemButton>
                          );
                        })}
                      </List>
                    </Collapse>
                  )}
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, minWidth: 0 }}>
        <ModuleNav />
        {children}
      </Box>
    </Box>
  );
}
