import axios from 'axios';

const BASE = '/api/v1';

let _token = '';
let _tenantId = 'a0000000-0000-0000-0000-000000000001';
let _userId = '';

export function setAuthHeaders(token: string, tenantId: string, userId: string) {
  _token = token;
  _tenantId = tenantId;
  _userId = userId;
}

function headers() {
  return {
    Authorization: `Bearer ${_token}`,
    'X-Tenant-ID': _tenantId,
    'X-User-ID': _userId,
  };
}

// ── Org ──────────────────────────────────────────────────────────────────────
export const orgApi = {
  // Org Units
  getTree:             ()                        => axios.get(`${BASE}/org-units/tree`, { headers: headers() }).then(r => r.data),
  getOrgUnits:         (p = 1, ps = 200)         => axios.get(`${BASE}/org-units?page=${p}&pageSize=${ps}`, { headers: headers() }).then(r => r.data),
  createOrgUnit:       (dto: any)                => axios.post(`${BASE}/org-units`, dto, { headers: headers() }).then(r => r.data),
  updateOrgUnit:       (id: string, dto: any)    => axios.put(`${BASE}/org-units/${id}`, dto, { headers: headers() }).then(r => r.data),
  deleteOrgUnit:       (id: string)              => axios.delete(`${BASE}/org-units/${id}`, { headers: headers() }).then(r => r.data),
  getManagerChain:     (id: string)              => axios.get(`${BASE}/org-units/${id}/manager-chain`, { headers: headers() }).then(r => r.data),

  // Users
  getUsers:            (p = 1, ps = 200, q?: any) => axios.get(`${BASE}/users`, { params: { page: p, pageSize: ps, ...q }, headers: headers() }).then(r => r.data),
  createUser:          (dto: any)                => axios.post(`${BASE}/users`, dto, { headers: headers() }).then(r => r.data),
  updateUser:          (id: string, dto: any)    => axios.put(`${BASE}/users/${id}`, dto, { headers: headers() }).then(r => r.data),
  deactivateUser:      (id: string)              => axios.delete(`${BASE}/users/${id}`, { headers: headers() }).then(r => r.data),
  activateUser:        (id: string)              => axios.delete(`${BASE}/users/${id}?action=activate`, { headers: headers() }).then(r => r.data),
  getUserManagers:     (id: string)              => axios.get(`${BASE}/users/${id}/managers`, { headers: headers() }).then(r => r.data),
  assignOrgUnit:       (id: string, dto: any)    => axios.post(`${BASE}/users/${id}/assignments`, dto, { headers: headers() }).then(r => r.data),

  // Positions
  getPositions:        (orgUnitId?: string)      => axios.get(`${BASE}/positions${orgUnitId ? `?orgUnitId=${orgUnitId}` : ''}`, { headers: headers() }).then(r => r.data),
  createPosition:      (dto: any)                => axios.post(`${BASE}/positions`, dto, { headers: headers() }).then(r => r.data),
  updatePosition:      (id: string, dto: any)    => axios.put(`${BASE}/positions/${id}`, dto, { headers: headers() }).then(r => r.data),

  // Roles
  getRoles:            ()                        => axios.get(`${BASE}/roles`, { headers: headers() }).then(r => r.data),
  updateRole:          (id: string, dto: any)    => axios.put(`${BASE}/roles/${id}`, dto, { headers: headers() }).then(r => r.data),
};

// ── Approval ──────────────────────────────────────────────────────────────────
export const approvalApi = {
  listPolicies:   (p = 1, ps = 20)         => axios.get(`${BASE}/approval/policies?page=${p}&pageSize=${ps}`, { headers: headers() }).then(r => r.data),
  getPolicy:      (id: string)             => axios.get(`${BASE}/approval/policies/${id}`, { headers: headers() }).then(r => r.data),
  createPolicy:   (dto: any)               => axios.post(`${BASE}/approval/policies`, dto, { headers: headers() }).then(r => r.data),
  updatePolicy:   (id: string, dto: any)   => axios.put(`${BASE}/approval/policies/${id}`, dto, { headers: headers() }).then(r => r.data),
  listInstances:  (q: any, p = 1, ps = 20) => axios.get(`${BASE}/approval/instances`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
  listPending:    (p = 1, ps = 50)         => axios.get(`${BASE}/approval/instances/pending?page=${p}&pageSize=${ps}`, { headers: headers() }).then(r => r.data),
  getInstance:    (id: string)             => axios.get(`${BASE}/approval/instances/${id}`, { headers: headers() }).then(r => r.data),
  createInstance: (dto: any)               => axios.post(`${BASE}/approval/instances`, dto, { headers: headers() }).then(r => r.data),
  approveStep:    (id: string, stepId: string, dto: any) => axios.post(`${BASE}/approval/instances/${id}/steps/${stepId}/approve`, dto, { headers: headers() }).then(r => r.data),
  rejectStep:     (id: string, stepId: string, dto: any) => axios.post(`${BASE}/approval/instances/${id}/steps/${stepId}/reject`, dto, { headers: headers() }).then(r => r.data),
};

// ── Process ──────────────────────────────────────────────────────────────────
export const processApi = {
  listDefs:               (p = 1, ps = 20)         => axios.get(`${BASE}/processes/definitions?page=${p}&pageSize=${ps}`, { headers: headers() }).then(r => r.data),
  getDef:                 (id: string)             => axios.get(`${BASE}/processes/definitions/${id}`, { headers: headers() }).then(r => r.data),
  getStartForm:           (slug: string)           => axios.get(`${BASE}/processes/definitions/slug/${slug}/start-form`, { headers: headers() }).then(r => r.data),
  createDef:              (dto: any)               => axios.post(`${BASE}/processes/definitions`, dto, { headers: headers() }).then(r => r.data),
  updateDef:              (id: string, dto: any)   => axios.put(`${BASE}/processes/definitions/${id}`, dto, { headers: headers() }).then(r => r.data),
  publishDef:             (id: string)             => axios.post(`${BASE}/processes/definitions/${id}/publish`, {}, { headers: headers() }).then(r => r.data),
  newDefVersion:          (id: string)             => axios.post(`${BASE}/processes/definitions/${id}/new-version`, {}, { headers: headers() }).then(r => r.data),
  unpublishDef:           (id: string)             => axios.post(`${BASE}/processes/definitions/${id}/unpublish`, {}, { headers: headers() }).then(r => r.data),
  archiveDef:             (id: string)             => axios.post(`${BASE}/processes/definitions/${id}/archive`, {}, { headers: headers() }).then(r => r.data),
  deleteDef:              (id: string)             => axios.delete(`${BASE}/processes/definitions/${id}`, { headers: headers() }).then(r => r.data),
  listInstances:          (q: any, p = 1, ps = 20) => axios.get(`${BASE}/processes/instances`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
  getInstance:            (id: string)             => axios.get(`${BASE}/processes/instances/${id}`, { headers: headers() }).then(r => r.data),
  startProcess:           (dto: any)               => axios.post(`${BASE}/processes/instances`, dto, { headers: headers() }).then(r => r.data),
  suspendInstance:        (id: string)             => axios.patch(`${BASE}/processes/instances/${id}/suspend`, {}, { headers: headers() }).then(r => r.data),
  resumeInstance:         (id: string)             => axios.patch(`${BASE}/processes/instances/${id}/resume`, {}, { headers: headers() }).then(r => r.data),
  terminateInstance:      (id: string, reason: string) => axios.patch(`${BASE}/processes/instances/${id}/terminate`, { reason }, { headers: headers() }).then(r => r.data),
  deleteInstance:         (id: string)             => axios.delete(`${BASE}/processes/instances/${id}`, { headers: headers() }).then(r => r.data),
  updateInstanceVariables:(id: string, variables: any) => axios.patch(`${BASE}/processes/instances/${id}/variables`, { variables }, { headers: headers() }).then(r => r.data),
  listTasks:              (q: any, p = 1, ps = 20) => axios.get(`${BASE}/tasks`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
  getTask:                (id: string)             => axios.get(`${BASE}/tasks/${id}`, { headers: headers() }).then(r => r.data),
  claimTask:              (id: string)             => axios.patch(`${BASE}/tasks/${id}/claim`, {}, { headers: headers() }).then(r => r.data),
  completeTask:           (id: string, dto: any)   => axios.post(`${BASE}/tasks/${id}/complete`, dto, { headers: headers() }).then(r => r.data),
  addTaskComment:         (id: string, message: string) => axios.post(`${BASE}/tasks/${id}/comment`, { message }, { headers: headers() }).then(r => r.data),
};

// ── Cases ──────────────────────────────────────────────────────────────────
export const meApi = {
  get: () => axios.get(`${BASE}/me`, { headers: headers() }).then(r => r.data),
};

export const caseApi = {
  list:          (q: any, p = 1, ps = 20) => axios.get(`${BASE}/cases`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
  get:           (id: string)             => axios.get(`${BASE}/cases/${id}`, { headers: headers() }).then(r => r.data),
  create:        (dto: any)               => axios.post(`${BASE}/cases`, dto, { headers: headers() }).then(r => r.data),
  update:        (id: string, dto: any)   => axios.put(`${BASE}/cases/${id}`, dto, { headers: headers() }).then(r => r.data),
  transition:    (id: string, dto: any)   => axios.patch(`${BASE}/cases/${id}/transition`, dto, { headers: headers() }).then(r => r.data),
  assign:        (id: string, dto: any)   => axios.patch(`${BASE}/cases/${id}/assign`, dto, { headers: headers() }).then(r => r.data),
  getComments:   (id: string, internal = true) => axios.get(`${BASE}/cases/${id}/comments`, { params: { internal: internal ? 'true' : undefined }, headers: headers() }).then(r => r.data),
  addComment:    (id: string, dto: any)   => axios.post(`${BASE}/cases/${id}/comments`, dto, { headers: headers() }).then(r => r.data),
  stats:         ()                       => axios.get(`${BASE}/cases/stats`, { headers: headers() }).then(r => r.data),
  // My work: cases assigned to me (mine=true) + unclaimed cases in my teams (mine=false), one query.
  getMyWork:     ()                       => axios.get(`${BASE}/cases/my-work`, { headers: headers() }).then(r => r.data),
  opsOverview:   ()                       => axios.get(`${BASE}/cases/ops-overview`, { headers: headers() }).then(r => r.data),
  byDivision:    ()                       => axios.get(`${BASE}/cases/by-division`, { headers: headers() }).then(r => r.data),
  byDepartment:         (divisionId: string)     => axios.get(`${BASE}/cases/by-department`, { params: { divisionId }, headers: headers() }).then(r => r.data),
  dispatchToContractor: (caseId: string, dto: any) => axios.post(`${BASE}/contractors/dispatch`, { case_id: caseId, ...dto }, { headers: headers() }).then(r => r.data),
  getChildren:     (id: string)            => axios.get(`${BASE}/cases/${id}/children`, { headers: headers() }).then(r => r.data),
  createWorkOrder: (id: string, dto: any)  => axios.post(`${BASE}/cases/${id}/work-orders`, dto, { headers: headers() }).then(r => r.data),
  getLinks:        (id: string)            => axios.get(`${BASE}/cases/${id}/links`, { headers: headers() }).then(r => r.data),
  addLink:         (id: string, dto: any)  => axios.post(`${BASE}/cases/${id}/links`, dto, { headers: headers() }).then(r => r.data),
  removeLink:      (id: string, linkId: string) => axios.delete(`${BASE}/cases/${id}/links/${linkId}`, { headers: headers() }).then(r => r.data),
  linkTypes:       ()                      => axios.get(`${BASE}/cases/meta/link-types`, { headers: headers() }).then(r => r.data),
  // SLA pause / exclusion (stop-the-clock)
  pauseSla:        (id: string, dto: { reason: string; note?: string }) => axios.post(`${BASE}/cases/${id}/sla/pause`, dto, { headers: headers() }).then(r => r.data),
  resumeSla:       (id: string, dto: { note?: string } = {}) => axios.post(`${BASE}/cases/${id}/sla/resume`, dto, { headers: headers() }).then(r => r.data),
  getSlaPauses:    (id: string)            => axios.get(`${BASE}/cases/${id}/sla/pauses`, { headers: headers() }).then(r => r.data),
  slaPauseReasons: ()                      => axios.get(`${BASE}/cases/meta/sla-pause-reasons`, { headers: headers() }).then(r => r.data),
  declareMajor:    (id: string, dto: { reason?: string; mimId?: string; expected_version?: number }) => axios.post(`${BASE}/cases/${id}/declare-major`, dto, { headers: headers() }).then(r => r.data),
  getVendorEscalations: (id: string)       => axios.get(`${BASE}/cases/${id}/vendor-escalations`, { headers: headers() }).then(r => r.data),
  raiseVendorEscalation: (id: string, dto: { vendorCode: string; reason?: string; pauseSla?: boolean }) => axios.post(`${BASE}/cases/${id}/vendor-escalations`, dto, { headers: headers() }).then(r => r.data),
  updateVendorEscalation: (id: string, eid: string, dto: { status?: string; notes?: string }) => axios.patch(`${BASE}/cases/${id}/vendor-escalations/${eid}`, dto, { headers: headers() }).then(r => r.data),
  // RCA Level-2 + CAPA
  getRca:        (id: string)              => axios.get(`${BASE}/cases/${id}/rca`, { headers: headers() }).then(r => r.data),
  rcaSimilar:    (id: string)              => axios.get(`${BASE}/cases/${id}/rca/similar`, { headers: headers() }).then(r => r.data),
  rcaSuggest:    (id: string)              => axios.get(`${BASE}/cases/${id}/rca/suggest`, { headers: headers() }).then(r => r.data),
  saveRca:       (id: string, dto: any)    => axios.put(`${BASE}/cases/${id}/rca`, dto, { headers: headers() }).then(r => r.data),
  listCapa:      (id: string)              => axios.get(`${BASE}/cases/${id}/capa`, { headers: headers() }).then(r => r.data),
  addCapa:       (id: string, dto: any)    => axios.post(`${BASE}/cases/${id}/capa`, dto, { headers: headers() }).then(r => r.data),
  updateCapa:    (id: string, aid: string, dto: any) => axios.patch(`${BASE}/cases/${id}/capa/${aid}`, dto, { headers: headers() }).then(r => r.data),
};

// ── Connectors ──────────────────────────────────────────────────────────────
export const connectorApi = {
  list:       (p = 1, ps = 20)         => axios.get(`${BASE}/integrations/connectors?page=${p}&pageSize=${ps}`, { headers: headers() }).then(r => r.data),
  get:        (id: string)             => axios.get(`${BASE}/integrations/connectors/${id}`, { headers: headers() }).then(r => r.data),
  create:     (dto: any)               => axios.post(`${BASE}/integrations/connectors`, dto, { headers: headers() }).then(r => r.data),
  update:     (id: string, dto: any)   => axios.put(`${BASE}/integrations/connectors/${id}`, dto, { headers: headers() }).then(r => r.data),
  activate:   (id: string)             => axios.patch(`${BASE}/integrations/connectors/${id}/activate`, {}, { headers: headers() }).then(r => r.data),
  deactivate: (id: string)             => axios.patch(`${BASE}/integrations/connectors/${id}/deactivate`, {}, { headers: headers() }).then(r => r.data),
  execute:    (id: string, dto: any)   => axios.post(`${BASE}/integrations/connectors/${id}/test`, dto, { headers: headers() }).then(r => r.data),
  getLogs:    (id: string, p = 1)      => axios.get(`${BASE}/integrations/connectors/${id}/logs?page=${p}`, { headers: headers() }).then(r => r.data),
};

// ── Notifications ──────────────────────────────────────────────────────────
export const notifApi = {
  list:     (unread = false, p = 1) => axios.get(`${BASE}/notifications?unread=${unread}&page=${p}`, { headers: headers() }).then(r => r.data),
  count:    ()                       => axios.get(`${BASE}/notifications/count`, { headers: headers() }).then(r => r.data),
  markRead: (ids: string[])          => axios.patch(`${BASE}/notifications/read`, { ids }, { headers: headers() }).then(r => r.data),
  // Template management
  listTemplates: ()                          => axios.get(`${BASE}/notifications/templates`, { headers: headers() }).then(r => r.data),
  getTemplate:   (slug: string)              => axios.get(`${BASE}/notifications/templates/${slug}`, { headers: headers() }).then(r => r.data),
  saveTemplate:  (slug: string, dto: any)    => axios.put(`${BASE}/notifications/templates/${slug}`, dto, { headers: headers() }).then(r => r.data),
};

// ── Audit ──────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (q: any, p = 1, ps = 50) => axios.get(`${BASE}/audit`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
};

// ── Process Analytics ──────────────────────────────────────────────────────
export const analyticsApi = {
  summary:      ()              => axios.get(`${BASE}/processes/analytics/summary`,       { headers: headers() }).then(r => r.data),
  byDefinition: ()              => axios.get(`${BASE}/processes/analytics/by-definition`, { headers: headers() }).then(r => r.data),
  overTime:     (days = 30)     => axios.get(`${BASE}/processes/analytics/over-time?days=${days}`, { headers: headers() }).then(r => r.data),
  bottlenecks:  ()              => axios.get(`${BASE}/processes/analytics/bottlenecks`,   { headers: headers() }).then(r => r.data),
  sla:          ()              => axios.get(`${BASE}/processes/analytics/sla`,           { headers: headers() }).then(r => r.data),
  workload:     ()              => axios.get(`${BASE}/processes/analytics/workload`,       { headers: headers() }).then(r => r.data),
};

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportApi = {
  sources:        ()                  => axios.get(`${BASE}/reports/sources`,        { headers: headers() }).then(r => r.data),
  run:            (dto: any)          => axios.post(`${BASE}/reports/run`, dto,       { headers: headers() }).then(r => r.data),
  listTemplates:  ()                  => axios.get(`${BASE}/reports/templates`,       { headers: headers() }).then(r => r.data),
  getTemplate:    (id: string)        => axios.get(`${BASE}/reports/templates/${id}`, { headers: headers() }).then(r => r.data),
  saveTemplate:   (dto: any)          => axios.post(`${BASE}/reports/templates`, dto,  { headers: headers() }).then(r => r.data),
  updateTemplate: (id: string, dto: any) => axios.put(`${BASE}/reports/templates/${id}`, dto, { headers: headers() }).then(r => r.data),
  deleteTemplate: (id: string)        => axios.delete(`${BASE}/reports/templates/${id}`, { headers: headers() }).then(r => r.data),
};

// ── Management Digest ────────────────────────────────────────────────────────
export const digestApi = {
  overview:        ()           => axios.get(`${BASE}/digest/overview`,    { headers: headers() }).then(r => r.data),
  getConfig:       ()           => axios.get(`${BASE}/digest/config`,      { headers: headers() }).then(r => r.data),
  updateConfig:    (dto: any)   => axios.put(`${BASE}/digest/config`, dto,  { headers: headers() }).then(r => r.data),
  recipients:      ()           => axios.get(`${BASE}/digest/recipients`,  { headers: headers() }).then(r => r.data),
  addRecipient:    (dto: any)   => axios.post(`${BASE}/digest/recipients`, dto, { headers: headers() }).then(r => r.data),
  removeRecipient: (id: string) => axios.delete(`${BASE}/digest/recipients/${id}`, { headers: headers() }).then(r => r.data),
  runs:            ()           => axios.get(`${BASE}/digest/runs`,        { headers: headers() }).then(r => r.data),
  getRun:          (id: string) => axios.get(`${BASE}/digest/runs/${id}`,  { headers: headers() }).then(r => r.data),
  preview:         ()           => axios.post(`${BASE}/digest/preview`, {}, { headers: headers() }).then(r => r.data),
  send:            (dto: any = {}) => axios.post(`${BASE}/digest/send`, dto, { headers: headers() }).then(r => r.data),
};

// ── Dashboard ──────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => axios.get(`${BASE}/dashboard`, { headers: headers() }).then(r => r.data),
};

// ── MDM ──────────────────────────────────────────────────────────────────────
export const mdmApi = {
  // Hosts
  list:          (q: any, p = 1, ps = 20) => axios.get(`${BASE}/mdm/hosts`, { params: { ...q, page: p, pageSize: ps }, headers: headers() }).then(r => r.data),
  get:           (id: string)             => axios.get(`${BASE}/mdm/hosts/${id}`, { headers: headers() }).then(r => r.data),
  create:        (dto: any)               => axios.post(`${BASE}/mdm/hosts`, dto, { headers: headers() }).then(r => r.data),
  update:        (id: string, dto: any)   => axios.put(`${BASE}/mdm/hosts/${id}`, dto, { headers: headers() }).then(r => r.data),
  remove:        (id: string)             => axios.delete(`${BASE}/mdm/hosts/${id}`, { headers: headers() }).then(r => r.data),
  filterOptions: ()                       => axios.get(`${BASE}/mdm/hosts/filter-options`, { headers: headers() }).then(r => r.data),
  stats:         ()                       => axios.get(`${BASE}/mdm/hosts/stats`, { headers: headers() }).then(r => r.data),
  exportUrl:     ()                       => `${BASE}/mdm/hosts/export`,
  importHosts:   (hosts: any[])           => axios.post(`${BASE}/mdm/hosts/import`, { hosts }, { headers: headers() }).then(r => r.data),
  // Lookups
  getLookups:    (type?: string)          => axios.get(`${BASE}/mdm/lookups`, { params: type ? { type } : {}, headers: headers() }).then(r => r.data),
  addLookup:     (dto: { type: string; value: string }) => axios.post(`${BASE}/mdm/lookups`, dto, { headers: headers() }).then(r => r.data),
  deleteLookup:  (id: string)             => axios.delete(`${BASE}/mdm/lookups/${id}`, { headers: headers() }).then(r => r.data),
};

// ── DataHub (Sites + travel-aware Hybrid SLA) ─────────────────────────────────
export const datahubApi = {
  listSites:  (q: any = {})              => axios.get(`${BASE}/datahub/sites`, { params: q, headers: headers() }).then(r => r.data),
  getSite:    (id: string)               => axios.get(`${BASE}/datahub/sites/${id}`, { headers: headers() }).then(r => r.data),
  slaPreview: (id: string, type: string, priority: string, slaClass?: string) =>
                axios.get(`${BASE}/datahub/sites/${id}/sla-preview`, { params: { type, priority, sla_class: slaClass }, headers: headers() }).then(r => r.data),
  createSite: (dto: any)                 => axios.post(`${BASE}/datahub/sites`, dto, { headers: headers() }).then(r => r.data),
  updateSite: (id: string, dto: any)     => axios.put(`${BASE}/datahub/sites/${id}`, dto, { headers: headers() }).then(r => r.data),
  deleteSite: (id: string)               => axios.delete(`${BASE}/datahub/sites/${id}`, { headers: headers() }).then(r => r.data),
  // Extension domains
  domains:    ()                            => axios.get(`${BASE}/datahub/domains`, { headers: headers() }).then(r => r.data),
  listDomain: (d: string, search?: string)  => axios.get(`${BASE}/datahub/domains/${d}`, { params: { search }, headers: headers() }).then(r => r.data),
  createItem: (d: string, dto: any)         => axios.post(`${BASE}/datahub/domains/${d}`, dto, { headers: headers() }).then(r => r.data),
  updateItem: (d: string, id: string, dto: any) => axios.put(`${BASE}/datahub/domains/${d}/${id}`, dto, { headers: headers() }).then(r => r.data),
  deleteItem: (d: string, id: string)       => axios.delete(`${BASE}/datahub/domains/${d}/${id}`, { headers: headers() }).then(r => r.data),
};

// ── SLA Policies (configurable targets + class factors) ───────────────────────
export const slaApi = {
  getTargets:        ()                                 => axios.get(`${BASE}/sla/targets`, { headers: headers() }).then(r => r.data),
  updateTarget:      (type: string, priority: string, dto: any) => axios.put(`${BASE}/sla/targets/${type}/${priority}`, dto, { headers: headers() }).then(r => r.data),
  getClassFactors:   ()                                 => axios.get(`${BASE}/sla/class-factors`, { headers: headers() }).then(r => r.data),
  updateClassFactor: (key: string, dto: any)            => axios.put(`${BASE}/sla/class-factors/${key}`, dto, { headers: headers() }).then(r => r.data),
};

// ── RCA ──────────────────────────────────────────────────────────────────────
export const rcaApi = {
  summary:         (days = 30)                              => axios.get(`${BASE}/rca/summary?days=${days}`,                  { headers: headers() }).then(r => r.data),
  pareto:          (by = 'root_cause_category', days = 30)  => axios.get(`${BASE}/rca/pareto?by=${by}&days=${days}`,          { headers: headers() }).then(r => r.data),
  trends:          (days = 30)                              => axios.get(`${BASE}/rca/trends?days=${days}`,                   { headers: headers() }).then(r => r.data),
  repeatOffenders: (days = 30)                              => axios.get(`${BASE}/rca/repeat-offenders?days=${days}`,         { headers: headers() }).then(r => r.data),
  processAnalysis: (days = 30)                              => axios.get(`${BASE}/rca/process-analysis?days=${days}`,         { headers: headers() }).then(r => r.data),
  resolutionTime:  (days = 30)                              => axios.get(`${BASE}/rca/resolution-time?days=${days}`,          { headers: headers() }).then(r => r.data),
  taxonomy:        ()                                       => axios.get(`${BASE}/rca/taxonomy`,                              { headers: headers() }).then(r => r.data),
  emergingProblems:()                                       => axios.get(`${BASE}/rca/emerging-problems`,                     { headers: headers() }).then(r => r.data),
};

// Extend processApi with reassign
export const taskReassign = (id: string, assigneeId: string) =>
  axios.patch(`${BASE}/tasks/${id}/reassign`, { assigneeId }, { headers: headers() }).then(r => r.data);

// ── Contractor / External Portal ─────────────────────────────────────────────
export const contractorApi = {
  // Company management
  getCompanies:   (params?: any) => axios.get(`${BASE}/contractors/companies`, { headers: headers(), params }),
  createCompany:  (dto: any)     => axios.post(`${BASE}/contractors/companies`, dto, { headers: headers() }),
  updateCompany:  (id: string, dto: any) => axios.put(`${BASE}/contractors/companies/${id}`, dto, { headers: headers() }),
  deleteCompany:  (id: string)   => axios.delete(`${BASE}/contractors/companies/${id}`, { headers: headers() }),

  // User management
  getUsers:       (params?: any) => axios.get(`${BASE}/contractors/users`, { headers: headers(), params }),
  createUser:     (dto: any)     => axios.post(`${BASE}/contractors/users`, dto, { headers: headers() }),
  updateUser:     (id: string, dto: any) => axios.put(`${BASE}/contractors/users/${id}`, dto, { headers: headers() }),
  resetPassword:  (id: string, dto: any) => axios.post(`${BASE}/contractors/users/${id}/reset-password`, dto, { headers: headers() }),

  // Work order assignments
  getAssignments: (params?: any) => axios.get(`${BASE}/contractors/assignments`, { headers: headers(), params }),
  getAssignment:  (id: string)   => axios.get(`${BASE}/contractors/assignments/${id}`, { headers: headers() }),
  addComment:     (id: string, body: string, internal = false) => axios.post(`${BASE}/contractors/assignments/${id}/comments`, { body, internal }, { headers: headers() }),
  dispatch:       (dto: any)     => axios.post(`${BASE}/contractors/dispatch`, dto, { headers: headers() }),
  approve:        (id: string, dto?: any) => axios.patch(`${BASE}/contractors/assignments/${id}/approve`, dto || {}, { headers: headers() }),
  requestRework:  (id: string, reason: string) => axios.patch(`${BASE}/contractors/assignments/${id}/rework`, { reason }, { headers: headers() }),
  reassign:       (id: string, dto: any) => axios.patch(`${BASE}/contractors/assignments/${id}/reassign`, dto, { headers: headers() }),
  respondReschedule: (id: string, dto: any) => axios.patch(`${BASE}/contractors/assignments/${id}/reschedule`, dto, { headers: headers() }),
  close:          (id: string, dto?: any) => axios.patch(`${BASE}/contractors/assignments/${id}/close`, dto || {}, { headers: headers() }),

  // Dashboard
  getDashboard:   (params?: any) => axios.get(`${BASE}/contractors/dashboard`, { headers: headers(), params }),
  getPerformance: (params?: any) => axios.get(`${BASE}/contractors/performance`, { headers: headers(), params }),
};
