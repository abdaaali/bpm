import { createTheme } from '@mui/material/styles';

// Design tokens: keep the existing blue brand identity, but make spacing,
// shadows, borders, hover/focus states, and transitions consistent across
// every page instead of ad hoc per-component. No new colors invented —
// primary/secondary/background match what was already here.
const RADIUS = 10;
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

export const theme = createTheme({
  palette: {
    primary:   { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
    background: { default: '#f4f6f9', paper: '#ffffff' },
    divider: 'rgba(15,23,42,0.08)',
  },
  shape: { borderRadius: RADIUS },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  transitions: {
    duration: { shortest: 120, shorter: 160, short: 200, standard: 240 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS + 4,
          boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.08)',
          border: '1px solid rgba(15,23,42,0.06)',
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: { borderRadius: RADIUS + 4 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS - 2,
          textTransform: 'none',
          fontWeight: 600,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.18)' },
        },
        outlined: {
          '&:hover': { backgroundColor: 'rgba(25,118,210,0.06)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: '0 1px 2px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.06)' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid rgba(15,23,42,0.08)' },
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
          '&:hover': { backgroundColor: 'rgba(25,118,210,0.04)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: 'rgba(15,23,42,0.08)' },
        head: { fontWeight: 700, color: 'rgba(15,23,42,0.65)' },
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
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, transition: `color ${TRANSITION}` },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': { outline: '2px solid #1976d2', outlineOffset: 2 },
        },
      },
    },
  },
});
