import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import AppsIcon from '@mui/icons-material/Apps';
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
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { notifApi } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

const DRAWER_WIDTH = 220;

// Launcher-model navigation: a slim rail of top-level destinations. Functional
// areas are opened from the Applications / Dashboards / Administration pages
// (tile launchers) rather than nested sidebar sections.
interface NavItem { label: string; icon: React.ReactNode; path: string; match: string[]; perm?: string; }

const NAV: NavItem[] = [
  { label: 'Home',           icon: <HomeIcon />,      path: '/home',      match: ['/home'] },
  { label: 'My Work',        icon: <WorkIcon />,      path: '/workplace', match: ['/workplace', '/inbox', '/tasks', '/requests', '/my-requests'] },
  { label: 'Applications',   icon: <AppsIcon />,      path: '/apps',      match: ['/apps', '/catalog', '/cases', '/contractors', '/processes', '/rca', '/approvals'] },
  { label: 'Dashboards',     icon: <DashboardIcon />, path: '/dashboards', match: ['/dashboards', '/dashboard', '/reports', '/digest'], perm: 'cases:read' },
  { label: 'Administration', icon: <SettingsIcon />,  path: '/admin',     match: ['/admin', '/org', '/mdm', '/audit'], perm: 'org:read' },
];

const COLLAPSE_KEY = 'bpm_nav_collapsed_sections';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
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

  const toggleSection = (title: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [title]: !prev[title] };
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

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(!open)} sx={{ mr: 2 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, mr: 3 }}>
            BPM Portal
          </Typography>
          <TextField
            size="small" placeholder="Search cases…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
            sx={{ flexGrow: 1, maxWidth: 420, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 1,
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  '& input': { color: 'inherit' }, '& input::placeholder': { color: 'rgba(255,255,255,0.8)' } }}
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
              <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={1}>
                <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                <Button size="small" onClick={() => markAllRead.mutate()} disabled={markAllRead.isLoading}>Mark all read</Button>
              </Box>
              <Divider />
              {(notifList?.data || []).length === 0 && (
                <Box p={3} textAlign="center"><Typography variant="body2" color="text.secondary">You're all caught up.</Typography></Box>
              )}
              {(notifList?.data || []).map((n: any) => (
                <Box key={n.id} px={2} py={1.25} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: n.read_at ? 'transparent' : 'action.hover' }}>
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
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Typography variant="body2" fontWeight={600}>{user?.name}</Typography>
            </MenuItem>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={logout}>Logout</MenuItem>
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
            {NAV.filter(item => can(item.perm)).map(item => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={isSelected(item)}
                  onClick={() => navigate(item.path)}
                  sx={{ borderRadius: 2, mx: 1, my: 0.25, py: 1.25, '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.contrastText', '& .MuiListItemIcon-root': { color: 'primary.contrastText' } } }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: isSelected(item) ? 'primary.contrastText' : 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 15, fontWeight: 600 }} />
                </ListItemButton>
              </ListItem>
            ))}
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
