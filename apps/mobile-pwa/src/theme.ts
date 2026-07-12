import { createTheme, Theme } from '@mui/material/styles';
import { MODES, Mode } from './connection';

const NEUTRAL_50 = '#f8f9fb';

// Same product family as apps/frontend-portal, but pushed noticeably further
// on this pass: bigger radius, stronger resting shadow, and real hover/press
// transitions on every interactive control (buttons, list rows, bottom nav) —
// only the accent color changes per mode.
function buildTheme(primary: string): Theme {
  return createTheme({
    palette: {
      primary: { main: primary },
      background: { default: NEUTRAL_50, paper: '#ffffff' },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h5: { fontWeight: 800 },
      h6: { fontWeight: 700 },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            boxShadow: '0 4px 20px rgba(15,23,42,0.10)',
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: {
          root: { borderRadius: 18 },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            textTransform: 'none',
            fontWeight: 700,
            paddingTop: 10,
            paddingBottom: 10,
            transition: 'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease, background-color 180ms ease',
            '&:active': { transform: 'scale(0.97)' },
          },
          sizeLarge: { paddingTop: 14, paddingBottom: 14, fontSize: '1.02rem' },
          contained: {
            boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
            '&:hover': { boxShadow: '0 8px 20px rgba(0,0,0,0.22)', transform: 'translateY(-1px)' },
          },
          outlined: {
            borderWidth: 1.5,
            '&:hover': { borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.03)' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 700 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            transition: 'background-color 180ms ease, transform 180ms ease',
            '&:active': { transform: 'scale(0.99)' },
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            transition: 'color 200ms ease, transform 200ms ease',
            '&.Mui-selected': { fontWeight: 700, transform: 'translateY(-2px)' },
          },
          label: {
            transition: 'font-size 200ms ease, opacity 200ms ease',
            '&.Mui-selected': { fontSize: '0.76rem' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: { boxShadow: '0 2px 12px rgba(15,23,42,0.12)' },
        },
      },
    },
  });
}

// One theme per mode, built once (not on every render) — plus a neutral
// default for the Connect screen, before any mode is chosen.
const THEME_BY_MODE: Record<Mode, Theme> = {
  bpm: buildTheme(MODES.find((m) => m.mode === 'bpm')!.color),
  contractor: buildTheme(MODES.find((m) => m.mode === 'contractor')!.color),
};
const DEFAULT_THEME = buildTheme(MODES.find((m) => m.mode === 'bpm')!.color);

export function getTheme(mode: Mode | null | undefined): Theme {
  return mode ? THEME_BY_MODE[mode] : DEFAULT_THEME;
}

export function modeMeta(mode: Mode | null | undefined) {
  return MODES.find((m) => m.mode === mode);
}
