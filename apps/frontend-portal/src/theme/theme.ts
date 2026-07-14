import { alpha, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

const NEUTRAL = {
  50: '#f6f8fc', 100: '#eef3fb', 200: '#e4e7ec', 300: '#d0d5dd', 400: '#98a2b3',
  500: '#667085', 600: '#475467', 700: '#344054', 800: '#1d2939', 900: '#101828',
};

const SEMANTIC = { success: '#15803d', warning: '#d97706', error: '#dc2626', info: '#2563eb' };
const DARK_SEMANTIC = { success: '#22c55e', warning: '#f59e0b', error: '#ef4444', info: '#60a5fa' };
const RADIUS = { sm: 6, md: 8, lg: 12 };
const TRANSITION = '160ms cubic-bezier(0.4, 0, 0.2, 1)';

export function getInteractiveTints(mode: PaletteMode) {
  const dark = mode === 'dark';
  return {
    hoverTintWeak: dark ? 'rgba(96,165,250,0.10)' : 'rgba(37,99,235,0.05)',
    hoverTintStrong: dark ? 'rgba(96,165,250,0.16)' : 'rgba(37,99,235,0.08)',
    selectedTint: dark ? 'rgba(59,130,246,0.22)' : 'rgba(37,99,235,0.10)',
    buttonShadow: dark ? '0 8px 18px rgba(0,0,0,0.32)' : '0 8px 18px rgba(37,99,235,0.18)',
    buttonShadowHover: dark ? '0 10px 24px rgba(0,0,0,0.42)' : '0 10px 24px rgba(37,99,235,0.22)',
    paperShadow: dark
      ? '0 14px 34px rgba(0,0,0,0.30)'
      : '0 12px 30px rgba(16,24,40,0.08)',
  };
}

export function createAppTheme(mode: PaletteMode) {
  const dark = mode === 'dark';
  const primary = dark ? '#3b82f6' : '#2563eb';
  const primaryHover = dark ? '#60a5fa' : '#1d4ed8';
  const divider = dark ? 'rgba(148,163,184,0.18)' : NEUTRAL[200];
  const cardBorder = dark ? 'rgba(148,163,184,0.22)' : NEUTRAL[200];
  const paper = dark ? '#111e31' : '#ffffff';
  const defaultBackground = dark ? '#08111f' : NEUTRAL[50];
  const elevated = dark ? '#17253a' : '#ffffff';
  const sidebar = dark ? '#0d1828' : '#ffffff';
  const primaryText = dark ? '#f1f5f9' : NEUTRAL[900];
  const secondaryText = dark ? '#a8b3c5' : NEUTRAL[500];
  const mutedText = dark ? '#7f8da3' : NEUTRAL[400];
  const semantic = dark ? DARK_SEMANTIC : SEMANTIC;
  const { hoverTintWeak, hoverTintStrong, buttonShadow, buttonShadowHover, paperShadow } = getInteractiveTints(mode);

  return createTheme({
    palette: {
      mode,
      primary: { main: primary, dark: primaryHover, light: dark ? '#93c5fd' : '#60a5fa' },
      secondary: { main: dark ? '#c084fc' : '#7c3aed' },
      success: { main: semantic.success },
      warning: { main: semantic.warning },
      error: { main: semantic.error },
      info: { main: semantic.info },
      background: { default: defaultBackground, paper },
      divider,
      text: { primary: primaryText, secondary: secondaryText, disabled: mutedText },
    },
    shape: { borderRadius: RADIUS.md },
    typography: {
      fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
      h4: { fontSize: '1.5rem', lineHeight: 1.25, fontWeight: 700 },
      h5: { fontSize: '1.125rem', lineHeight: 1.35, fontWeight: 700 },
      h6: { fontSize: '1rem', lineHeight: 1.4, fontWeight: 700 },
      body1: { fontSize: '0.875rem', lineHeight: 1.55 },
      body2: { fontSize: '0.8125rem', lineHeight: 1.5, color: secondaryText },
      button: { fontSize: '0.875rem', fontWeight: 700, letterSpacing: 0 },
      caption: { fontSize: '0.75rem', lineHeight: 1.45, fontWeight: 500, letterSpacing: 0 },
    },
    transitions: {
      duration: { shortest: 120, shorter: 160, short: 200, standard: 240 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
            '--bpm-background': defaultBackground,
            '--bpm-sidebar': sidebar,
            '--bpm-surface': paper,
            '--bpm-surface-elevated': elevated,
            '--bpm-border': divider,
            '--bpm-text-primary': primaryText,
            '--bpm-text-secondary': secondaryText,
            '--bpm-text-muted': mutedText,
            '--bpm-primary': primary,
          },
          'html, body, #root': { minHeight: '100%' },
          body: { backgroundColor: defaultBackground, color: primaryText, letterSpacing: 0 },
          '*': { boxSizing: 'border-box' },
          '::selection': { backgroundColor: alpha(primary, 0.24) },
          'a': { color: primary, textDecoration: 'none' },
          '.recharts-cartesian-grid line': { stroke: dark ? 'rgba(148,163,184,0.16)' : '#e4e7ec' },
          '.recharts-text': { fill: secondaryText },
          '.recharts-tooltip-wrapper .recharts-default-tooltip': {
            backgroundColor: `${elevated} !important`,
            border: `1px solid ${cardBorder} !important`,
            borderRadius: `${RADIUS.md}px !important`,
            color: `${primaryText} !important`,
            boxShadow: `${paperShadow} !important`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', color: primaryText },
          elevation1: { boxShadow: paperShadow },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            boxShadow: dark ? 'none' : '0 8px 24px rgba(16,24,40,0.06)',
            border: `1px solid ${cardBorder}`,
            backgroundColor: paper,
            color: primaryText,
            transition: `box-shadow ${TRANSITION}, transform ${TRANSITION}, border-color ${TRANSITION}, background-color ${TRANSITION}`,
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: { root: { borderRadius: RADIUS.md, '&:hover': { backgroundColor: hoverTintWeak } } },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: dark ? '#08111f' : '#ffffff',
            color: primaryText,
            boxShadow: `0 1px 0 ${divider}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundImage: 'none', backgroundColor: sidebar, borderRight: `1px solid ${divider}`, color: primaryText },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm,
            textTransform: 'none',
            fontWeight: 700,
            minHeight: 40,
            transition: `background-color ${TRANSITION}, border-color ${TRANSITION}, box-shadow ${TRANSITION}, transform ${TRANSITION}`,
            '&:active': { transform: 'scale(0.98)' },
          },
          containedPrimary: {
            color: '#ffffff',
            boxShadow: buttonShadow,
            backgroundImage: `linear-gradient(180deg, ${alpha('#ffffff', 0.10)}, ${alpha('#000000', 0.02)})`,
            '&:hover': { backgroundColor: primaryHover, boxShadow: buttonShadowHover },
          },
          outlined: { borderColor: cardBorder, '&:hover': { backgroundColor: hoverTintStrong, borderColor: alpha(primary, 0.42) } },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { color: secondaryText, '&:hover': { backgroundColor: hoverTintStrong, color: primaryText } } },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 700 } } },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: RADIUS.md, transition: `background-color ${TRANSITION}, color ${TRANSITION}` } },
      },
      MuiTableContainer: {
        styleOverrides: { root: { border: `1px solid ${cardBorder}`, borderRadius: RADIUS.md, backgroundColor: paper } },
      },
      MuiTableHead: { styleOverrides: { root: { backgroundColor: dark ? '#142238' : '#f8fafc' } } },
      MuiTableRow: {
        styleOverrides: { root: { transition: `background-color ${TRANSITION}`, '&:hover': { backgroundColor: hoverTintWeak } } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottomColor: divider, fontSize: '0.8125rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
          head: { color: secondaryText, fontSize: '0.75rem', fontWeight: 800, letterSpacing: 0, textTransform: 'none' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            backgroundColor: dark ? 'rgba(255,255,255,0.03)' : '#ffffff',
            transition: `border-color ${TRANSITION}, box-shadow ${TRANSITION}, background-color ${TRANSITION}`,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: cardBorder },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(primary, 0.42) },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(primary, 0.16)}` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: primary },
          },
          input: { '&::placeholder': { color: mutedText, opacity: 1 } },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { color: secondaryText } } },
      MuiMenu: { styleOverrides: { paper: { border: `1px solid ${cardBorder}`, borderRadius: RADIUS.md, boxShadow: paperShadow } } },
      MuiPopover: { styleOverrides: { paper: { border: `1px solid ${cardBorder}`, borderRadius: RADIUS.md, boxShadow: paperShadow } } },
      MuiDialog: { styleOverrides: { paper: { border: `1px solid ${cardBorder}`, borderRadius: RADIUS.lg, boxShadow: paperShadow } } },
      MuiTabs: {
        styleOverrides: { root: { minHeight: 40 }, indicator: { height: 3, borderRadius: 3, backgroundColor: primary } },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            textTransform: 'none',
            fontWeight: 700,
            color: secondaryText,
            letterSpacing: 0,
            '&:hover': { color: primaryText, backgroundColor: hoverTintWeak },
            '&.Mui-selected': { color: primary },
          },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
        styleOverrides: { root: { '&.Mui-focusVisible': { outline: `2px solid ${primary}`, outlineOffset: 2 } } },
      },
    },
  });
}

export const theme = createAppTheme('light');
export const NEUTRAL_SCALE = NEUTRAL;
export const SEMANTIC_COLORS = SEMANTIC;
export const RADIUS_SCALE = RADIUS;
