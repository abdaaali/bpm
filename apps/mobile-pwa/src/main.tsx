import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import App from './App';

const theme = createTheme({ palette: { primary: { main: '#0d47a1' } }, shape: { borderRadius: 12 } });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>
  </React.StrictMode>,
);
