import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  AppBar, Box, Drawer, IconButton, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Toolbar, Typography, Avatar, Menu, MenuItem,
  Badge, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon, Dashboard, Assignment, Group, Notifications,
  Person, Logout, HardwareOutlined, ChevronRight,
} from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: 'Dashboard', icon: <Dashboard />, path: '/' },
  { label: 'Work Orders', icon: <Assignment />, path: '/work-orders' },
  { label: 'My Team', icon: <Group />, path: '/team', roles: ['company_admin', 'supervisor'] },
  { label: 'Notifications', icon: <Notifications />, path: '/notifications' },
  { label: 'My Profile', icon: <Person />, path: '/profile' },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const visibleNav = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(user?.role || ''));

  const drawer = (
    <Box>
      <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white' }}>
        <Box display="flex" alignItems="center" gap={1}>
          <HardwareOutlined />
          <Box>
            <Typography variant="subtitle2" fontWeight="bold">Contractor Portal</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>{user?.company_name}</Typography>
          </Box>
        </Box>
      </Box>
      <Divider />
      <List sx={{ py: 1 }}>
        {visibleNav.map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <ListItem key={item.label} disablePadding>
              <ListItemButton
                onClick={() => { navigate(item.path); if (isMobile) setMobileOpen(false); }}
                sx={{ borderRadius: 1, mx: 0.5, bgcolor: isActive ? 'primary.light' : 'transparent', color: isActive ? 'white' : 'inherit', '&:hover': { bgcolor: isActive ? 'primary.light' : 'action.hover' } }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: isActive ? 600 : 400 }} />
                {isActive && <ChevronRight sx={{ fontSize: 16 }} />}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'primary.dark' }}>
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <HardwareOutlined sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontWeight: 700 }}>Contractor Portal</Typography>
          <Typography variant="body2" sx={{ mr: 2, opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>
            {user?.company_name}
          </Typography>
          <IconButton color="inherit" onClick={() => navigate('/notifications')}>
            <Badge badgeContent={0} color="error"><Notifications /></Badge>
          </IconButton>
          <IconButton onClick={e => setAnchorEl(e.currentTarget)} sx={{ ml: 1 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 14 }}>
              {user?.full_name?.charAt(0) || '?'}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography variant="body2" fontWeight="bold">{user?.full_name}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.role} · {user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { navigate('/profile'); setAnchorEl(null); }}>
              <ListItemIcon><Person fontSize="small" /></ListItemIcon>Profile
            </MenuItem>
            <MenuItem onClick={() => { logout(); navigate('/login'); setAnchorEl(null); }}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      {isMobile ? (
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          {drawer}
        </Drawer>
      ) : (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
          <Toolbar />
          {drawer}
        </Drawer>
      )}

      {/* Main content */}
      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, minHeight: '100vh', bgcolor: 'background.default' }}>
        <Outlet />
      </Box>
    </Box>
  );
}
