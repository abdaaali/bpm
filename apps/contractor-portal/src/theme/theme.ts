import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#e65100', light: '#ff833a', dark: '#ac1900' },
    secondary: { main: '#1565c0', light: '#5e92f3', dark: '#003c8f' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: { defaultProps: { elevation: 1 } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});

export default theme;
