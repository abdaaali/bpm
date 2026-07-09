import { createTheme } from '@mui/material/styles';

// Design tokens: orange/white brand stays exactly as it was (#e65100 primary,
// #1565c0 secondary) — this pass only makes spacing, shadows, borders,
// hover/focus states, and transitions consistent and more premium-feeling.
// Red is reserved for MUI's semantic `error` color (danger/overdue/critical),
// never used as a decorative accent.
const RADIUS = 10;
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

const theme = createTheme({
  palette: {
    primary: { main: '#e65100', light: '#ff833a', dark: '#ac1900' },
    secondary: { main: '#1565c0', light: '#5e92f3', dark: '#003c8f' },
    background: { default: '#f6f5f4', paper: '#ffffff' },
    divider: 'rgba(30,20,10,0.08)',
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: RADIUS },
  transitions: {
    duration: { shortest: 120, shorter: 160, short: 200, standard: 240 },
  },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: RADIUS + 4,
          border: '1px solid rgba(30,20,10,0.07)',
          boxShadow: '0 1px 3px rgba(60,30,0,0.05), 0 1px 2px rgba(60,30,0,0.07)',
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS - 2,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(230,81,0,0.25)',
          '&:hover': { boxShadow: '0 4px 14px rgba(230,81,0,0.32)' },
        },
        outlined: {
          '&:hover': { backgroundColor: 'rgba(230,81,0,0.06)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, transition: `background-color ${TRANSITION}, color ${TRANSITION}` },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: '0 1px 2px rgba(60,30,0,0.1), 0 2px 10px rgba(60,30,0,0.08)' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid rgba(30,20,10,0.08)' },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS - 2,
          transition: `background-color ${TRANSITION}, color ${TRANSITION}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background-color ${TRANSITION}`,
          '&:hover': { backgroundColor: 'rgba(230,81,0,0.045)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: 'rgba(30,20,10,0.08)' },
        head: { fontWeight: 700, color: 'rgba(40,25,10,0.65)' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS - 2,
          transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}`,
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': { outline: '2px solid #e65100', outlineOffset: 2 },
        },
      },
    },
  },
});

export default theme;
