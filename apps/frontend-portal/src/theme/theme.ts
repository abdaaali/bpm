import { createTheme } from '@mui/material/styles';

// Design System Foundation tokens (docs/superpowers/specs/2026-07-12-design-system-foundation-design.md).
// Same blue brand family as before, refined toward a more muted enterprise-tool
// shade; neutral scale, type scale, and radius/elevation rules now shared
// verbatim with contractor-portal and mobile-pwa (only the primary hue differs).
const NEUTRAL = {
  50: '#f8f9fb', 100: '#f1f3f6', 200: '#e6e9ee', 300: '#d4d8e0', 400: '#a8afbd',
  500: '#7b8494', 600: '#5b6373', 700: '#414957', 800: '#2a303c', 900: '#0f172a',
};
const SEMANTIC = { success: '#1b7a4a', warning: '#b5760f', error: '#c62d3f', info: '#2856c9' };
const RADIUS = { sm: 6, md: 10, lg: 14 };
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

export const theme = createTheme({
  palette: {
    primary:   { main: '#2856c9' },
    secondary: { main: '#9c27b0' },
    success:   { main: SEMANTIC.success },
    warning:   { main: SEMANTIC.warning },
    error:     { main: SEMANTIC.error },
    info:      { main: SEMANTIC.info },
    background: { default: NEUTRAL[50], paper: '#ffffff' },
    divider: NEUTRAL[200],
    text: { primary: NEUTRAL[900], secondary: NEUTRAL[500] },
  },
  shape: { borderRadius: RADIUS.md },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontSize: '1.375rem', fontWeight: 700 },      // page title, 22px
    h5: { fontSize: '1rem', fontWeight: 700 },           // section heading, 16px
    h6: { fontSize: '1rem', fontWeight: 700 },
    body2: { fontSize: '0.8125rem', color: NEUTRAL[500] }, // secondary/meta, 13px
    caption: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.04em' }, // 11px
  },
  transitions: {
    duration: { shortest: 120, shorter: 160, short: 200, standard: 240 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          boxShadow: 'none',
          border: `1px solid ${NEUTRAL[200]}`,
          transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}`,
        },
      },
    },
    MuiCardActionArea: { styleOverrides: { root: { borderRadius: RADIUS.md } } },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          textTransform: 'none',
          fontWeight: 600,
          transition: `background-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}, filter ${TRANSITION}`,
          '&:active': { transform: 'scale(0.98)' },
        },
        contained: {
          boxShadow: '0 2px 6px rgba(0,0,0,0.14)',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.18)' },
        },
        outlined: { '&:hover': { backgroundColor: 'rgba(40,86,201,0.06)' } },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 600 } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: `0 1px 0 ${NEUTRAL[200]}` } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${NEUTRAL[200]}` } } },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, transition: `background-color ${TRANSITION}, color ${TRANSITION}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { transition: `background-color ${TRANSITION}`, '&:hover': { backgroundColor: 'rgba(40,86,201,0.04)' } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: NEUTRAL[200],
          fontSize: '0.8125rem',
          fontVariantNumeric: 'tabular-nums',
        },
        head: { fontWeight: 700, color: NEUTRAL[600], fontSize: '0.6875rem', letterSpacing: '0.04em', textTransform: 'uppercase' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}` },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, transition: `color ${TRANSITION}` } } },
    MuiButtonBase: {
      defaultProps: { disableRipple: false },
      styleOverrides: {
        root: { '&.Mui-focusVisible': { outline: '2px solid #2856c9', outlineOffset: 2 } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { '&.MuiPaper-elevation1': { boxShadow: '0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.06)' } },
      },
    },
  },
});

export const NEUTRAL_SCALE = NEUTRAL;
export const SEMANTIC_COLORS = SEMANTIC;
export const RADIUS_SCALE = RADIUS;
