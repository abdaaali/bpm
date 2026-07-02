import { useQuery } from 'react-query';
import { meApi } from '../api/client';

/**
 * RBAC access hook — fetches the signed-in user's effective permissions from the
 * gateway (/me, the single source of truth) and exposes a `can(permission)`
 * check. UI gating is defense-in-depth; the gateway enforces the real guarantee.
 */
export function useAccess() {
  const { data } = useQuery('me', () => meApi.get(), { staleTime: 300_000 });
  const permissions: string[] = data?.permissions || [];
  const can = (perm?: string) => {
    if (!perm) return true;
    if (!permissions.length) return false;
    if (permissions.includes('*')) return true;
    const res = perm.split(':')[0];
    return permissions.includes(perm) || permissions.includes(`${res}:*`);
  };
  return { can, permissions, roles: (data?.roles as string[]) || [], me: data };
}
