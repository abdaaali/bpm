import axios from 'axios';
import { getConn, apiBase } from './connection';

export const api = axios.create();
api.interceptors.request.use((cfg) => {
  const conn = getConn();
  if (conn && cfg.url && cfg.url.startsWith('/')) cfg.url = apiBase(conn) + cfg.url;
  const tok = localStorage.getItem('pwa_token');
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});
