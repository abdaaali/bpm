/**
 * url-guard — SSRF protection for outbound connector requests.
 *
 * Connector URLs come from stored config and are interpolated with caller
 * payload, then fetched server-side. Without a guard this is a full-read SSRF:
 * a connector could be pointed at cloud metadata (169.254.169.254) or internal
 * services (postgres, keycloak, other microservices) and return their responses
 * to the caller. assertPublicUrl() enforces http(s) and rejects any host that
 * resolves to a private / loopback / link-local / unique-local address.
 *
 * Note: this validates at request time; a determined DNS-rebinding attacker
 * could still flip the record between check and connect. Blocking literal
 * internal targets and metadata covers the practical exposure; pinning the
 * resolved IP into the request is a future hardening.
 */
import { promises as dns } from 'dns';
import { isIP } from 'net';

function ipv4Blocked(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0) return true;                       // "this" network
  if (a === 10) return true;                      // 10/8 private
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true;        // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

function ipv6Blocked(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::1' || x === '::') return true;     // loopback / unspecified
  if (x.startsWith('fe80')) return true;          // link-local fe80::/10
  if (x.startsWith('fc') || x.startsWith('fd')) return true; // unique-local fc00::/7
  const m = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(x); // IPv4-mapped
  if (m) return ipv4Blocked(m[1]);
  return false;
}

function ipBlocked(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Blocked(ip);
  if (v === 6) return ipv6Blocked(ip);
  return true; // unrecognised → block
}

/** Throws if the URL is not an http(s) endpoint resolving to a public address. */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error(`Invalid connector URL: ${rawUrl}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Blocked connector URL scheme '${u.protocol}' (only http/https allowed)`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  let addrs: string[];
  if (isIP(host)) {
    addrs = [host];
  } else {
    const looked = await dns.lookup(host, { all: true });
    addrs = looked.map(l => l.address);
  }
  if (!addrs.length) throw new Error(`Could not resolve connector host: ${host}`);
  for (const a of addrs) {
    if (ipBlocked(a)) {
      throw new Error(`Blocked connector URL: ${host} resolves to non-public address ${a}`);
    }
  }
}
