/**
 * RBAC permission model (telecom-ops role model).
 *
 * Authorization is enforced at the gateway from the verified Keycloak JWT roles
 * (req.user.roles). Each protected route declares a required `resource:action`
 * via @RequirePermission(...); the PermissionsGuard checks it against the union
 * of the user's roles' permissions. Wildcards: '*' (all), 'resource:*' (all
 * actions on a resource).
 */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // Platform administrator — everything
  admin: ['*'],

  // Operations manager — runs the shop, approves, sees all (but not platform admin / process publishing)
  manager: [
    'cases:read', 'cases:create', 'cases:update', 'cases:assign', 'cases:resolve', 'cases:close', 'cases:link', 'cases:workorder',
    'tasks:*', 'approvals:*', 'processes:read', 'rca:*', 'mdm:read', 'mdm:write', 'contractors:read', 'contractors:dispatch',
    'contractors:manage', 'org:read', 'audit:read', 'notifications:manage', 'analytics:read',
  ],

  // NOC operator — fault/incident/alarm intake, triage and resolution
  noc: [
    'cases:read', 'cases:create', 'cases:update', 'cases:assign', 'cases:resolve', 'cases:link', 'cases:workorder',
    'tasks:*', 'processes:read', 'rca:read', 'mdm:read', 'analytics:read',
  ],

  // Field engineer — works assigned tasks / work orders in the field
  field_engineer: [
    'cases:read', 'cases:update', 'cases:workorder',
    'tasks:read', 'tasks:claim', 'tasks:complete', 'processes:read', 'mdm:read',
  ],

  // Security operations — theft cases, audits, investigations
  security: [
    'cases:read', 'cases:create', 'cases:update', 'cases:resolve', 'cases:close', 'cases:link',
    'tasks:*', 'processes:read', 'rca:*', 'analytics:read',
  ],

  // Logistics — asset movements, convoys, spare parts, contractor dispatch
  logistics: [
    'cases:read', 'cases:create', 'cases:update', 'cases:workorder', 'cases:link',
    'tasks:*', 'processes:read', 'contractors:read', 'contractors:dispatch', 'mdm:read',
  ],

  // Approver (CAB / finance / change authority) — decides approvals
  approver: ['cases:read', 'approvals:read', 'approvals:decide', 'tasks:read', 'processes:read'],

  // Requester / self-service — submits and tracks requests via the catalog
  requester: ['cases:read', 'cases:create', 'tasks:read', 'processes:read'],

  // Process designer — authors and publishes BPMN
  process_designer: ['processes:*', 'cases:read', 'analytics:read'],

  // ── legacy realm roles kept for back-compat (map to nearest telecom role) ──
  it_engineer: [
    'cases:read', 'cases:update', 'cases:workorder',
    'tasks:read', 'tasks:claim', 'tasks:complete', 'processes:read', 'mdm:read',
  ],
  cab_member: ['cases:read', 'approvals:read', 'approvals:decide', 'tasks:read', 'processes:read'],
  finance_controller: ['cases:read', 'approvals:read', 'approvals:decide', 'tasks:read', 'processes:read'],
};

/** Does any of the user's roles grant the required `resource:action` permission? */
export function hasPermission(roles: string[] | undefined, required: string, map: Record<string, string[]> = ROLE_PERMISSIONS): boolean {
  if (!required) return true;
  if (!roles?.length) return false;
  const [res] = required.split(':');
  for (const role of roles) {
    const perms = map[role];
    if (!perms) continue;
    for (const p of perms) {
      if (p === '*' || p === required || p === `${res}:*`) return true;
    }
  }
  return false;
}

/** The flattened, de-duplicated permission set for a user's roles (for the UI). */
export function permissionsFor(roles: string[] | undefined, map: Record<string, string[]> = ROLE_PERMISSIONS): string[] {
  const set = new Set<string>();
  for (const role of roles || []) for (const p of map[role] || []) set.add(p);
  return [...set];
}
