import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary:   { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
    background: { default: '#f4f6f9', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiCard:   { styleOverrides: { root: { borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 8, textTransform: 'none', fontWeight: 600 } } },
    MuiChip:   { styleOverrides: { root: { borderRadius: 6 } } },
  },
});
