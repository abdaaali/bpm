import { createTheme } from '@mui/material/styles';

// Design System Foundation tokens — same shape as apps/frontend-portal/src/theme/theme.ts,
// orange brand family refined toward a warmer, less "traffic-cone" shade.
// Red stays reserved for MUI's semantic `error` (danger/overdue/critical) — never decorative.
const NEUTRAL = {
  50: '#f8f9fb', 100: '#f1f3f6', 200: '#e6e9ee', 300: '#d4d8e0', 400: '#a8afbd',
  500: '#7b8494', 600: '#5b6373', 700: '#414957', 800: '#2a303c', 900: '#0f172a',
};
const SEMANTIC = { success: '#1b7a4a', warning: '#b5760f', error: '#c62d3f', info: '#2856c9' };
const RADIUS = { sm: 6, md: 10, lg: 14 };
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

const theme = createTheme({
  palette: {
    primary: { main: '#c65a13', light: '#e8813f', dark: '#8f3e0a' },
    secondary: { main: '#1565c0', light: '#5e92f3', dark: '#003c8f' },
    success:   { main: SEMANTIC.success },
    warning:   { main: SEMANTIC.warning },
    error:     { main: SEMANTIC.error },
    info:      { main: SEMANTIC.info },
    background: { default: NEUTRAL[50], paper: '#ffffff' },
    divider: NEUTRAL[200],
    text: { primary: NEUTRAL[900], secondary: NEUTRAL[500] },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h4: { fontSize: '1.375rem', fontWeight: 700 },
    h5: { fontSize: '1rem', fontWeight: 700 },
    h6: { fontSize: '1rem', fontWeight: 700 },
    body2: { fontSize: '0.8125rem', color: NEUTRAL[500] },
    caption: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' },
  },
  shape: { borderRadius: RADIUS.md },
  transitions: { duration: { shortest: 120, shorter: 160, short: 200, standard: 240 } },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          border: `1px solid ${NEUTRAL[200]}`,
          boxShadow: 'none',
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.sm,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(198,90,19,0.25)',
          '&:hover': { boxShadow: '0 4px 14px rgba(198,90,19,0.32)' },
        },
        outlined: { '&:hover': { backgroundColor: 'rgba(198,90,19,0.06)' } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 600, transition: `background-color ${TRANSITION}, color ${TRANSITION}` } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: `0 1px 0 ${NEUTRAL[200]}` } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${NEUTRAL[200]}` } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: RADIUS.sm, transition: `background-color ${TRANSITION}, color ${TRANSITION}` } } },
    MuiTableRow: { styleOverrides: { root: { transition: `background-color ${TRANSITION}`, '&:hover': { backgroundColor: 'rgba(198,90,19,0.045)' } } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: NEUTRAL[200], fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', fontWeight: 500 },
        head: { fontWeight: 700, color: NEUTRAL[600], fontSize: '0.6875rem', letterSpacing: '0.04em', textTransform: 'uppercase' },
      },
    },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: RADIUS.sm, transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}` } } },
    MuiButtonBase: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: '2px solid #c65a13', outlineOffset: 2 } } },
    },
  },
});

export const NEUTRAL_SCALE = NEUTRAL;
export const SEMANTIC_COLORS = SEMANTIC;
export const RADIUS_SCALE = RADIUS;
export default theme;
