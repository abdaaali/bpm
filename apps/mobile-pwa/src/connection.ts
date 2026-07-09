// Which backend the PWA is talking to. Stored locally; chosen on the Connect screen.
export type Mode = 'bpm' | 'contractor';
export interface Conn { mode: Mode; server: string; }   // server '' = same origin (nginx proxies)

const KEY = 'pwa_conn';
export function getConn(): Conn | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function setConn(c: Conn) { localStorage.setItem(KEY, JSON.stringify(c)); }
export function clearConn() { localStorage.removeItem(KEY); }

// Two clearly distinct brand identities sharing one product family:
// BPM Platform = white/blue (enterprise, trustworthy), Contractor Portal =
// white/orange (field operations, energetic). `color` drives the mode's
// accent everywhere (AppBar, buttons, active nav state, chips) via
// theme.ts's getTheme(); `gradient` is used only for hero/header surfaces
// (Connect cards, Login hero) so those specific spots get some depth without
// tinting the rest of the app.
export const MODES: { mode: Mode; title: string; subtitle: string; color: string; gradient: string }[] = [
  { mode: 'bpm', title: 'BPM Platform', subtitle: 'Cases, SLA & alerts for operators', color: '#1565c0', gradient: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)' },
  { mode: 'contractor', title: 'Contractor Portal', subtitle: 'Work orders for external field teams', color: '#ef6c00', gradient: 'linear-gradient(135deg, #ff9800 0%, #e65100 100%)' },
];
// API + auth bases derived from the connection.
export const apiBase = (c: Conn) => `${c.server}${c.mode === 'bpm' ? '/api/v1' : '/api/ext'}`;
export const kcTokenUrl = (c: Conn) => `${c.server}/kc/realms/bpm/protocol/openid-connect/token`;
