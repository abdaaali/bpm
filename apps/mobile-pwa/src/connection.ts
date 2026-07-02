// Which backend the PWA is talking to. Stored locally; chosen on the Connect screen.
export type Mode = 'bpm' | 'contractor';
export interface Conn { mode: Mode; server: string; }   // server '' = same origin (nginx proxies)

const KEY = 'pwa_conn';
export function getConn(): Conn | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setConn(c: Conn) { localStorage.setItem(KEY, JSON.stringify(c)); }
export function clearConn() { localStorage.removeItem(KEY); }

export const MODES: { mode: Mode; title: string; subtitle: string; color: string }[] = [
  { mode: 'bpm', title: 'BPM Platform', subtitle: 'Cases, SLA & alerts for operators', color: '#0d47a1' },
  { mode: 'contractor', title: 'Contractor Portal', subtitle: 'Work orders for external field teams', color: '#2e7d32' },
];
// API + auth bases derived from the connection.
export const apiBase = (c: Conn) => `${c.server}${c.mode === 'bpm' ? '/api/v1' : '/api/ext'}`;
export const kcTokenUrl = (c: Conn) => `${c.server}/kc/realms/bpm/protocol/openid-connect/token`;
