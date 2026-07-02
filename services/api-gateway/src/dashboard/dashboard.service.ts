import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  private async safeGet(url: string, headers: any): Promise<any> {
    try {
      const r = await axios.get(url, { headers, timeout: 8000 });
      return r.data;
    } catch { return null; }
  }

  async getDashboard(tenantId: string, userId: string, authHeader: string) {
    const h = { Authorization: authHeader, 'X-Tenant-ID': tenantId, 'X-User-ID': userId };
    const bpm = process.env.BPM_ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';
    const cas = process.env.CASE_SERVICE_URL || 'http://case-service:3004';
    const apr = process.env.APPROVAL_SERVICE_URL || 'http://approval-service:3002';
    const hub = process.env.INTEGRATION_HUB_URL || 'http://integration-hub:3005';

    const [taskStats, caseStats, approvalPending, mdmStats, topCases, pendingTasks] = await Promise.all([
      this.safeGet(`${bpm}/tasks/stats`, h),
      this.safeGet(`${cas}/cases/stats`, h),
      this.safeGet(`${apr}/instances/pending?pageSize=1`, h),
      this.safeGet(`${hub}/api/mdm/hosts/stats`, {}),
      this.safeGet(`${cas}/cases?priority=critical&pageSize=8`, h),
      this.safeGet(`${bpm}/tasks?status=pending&pageSize=5`, h),
    ]);

    return {
      tasks: {
        open: taskStats?.open ?? 0,
        inProgress: taskStats?.inProgress ?? 0,
        overdue: taskStats?.overdue ?? 0,
        slaBreached: taskStats?.slaBreached ?? 0,
        myTasks: taskStats?.myTasks ?? 0,
      },
      cases: {
        byType: caseStats?.byType ?? [],
        byStatus: caseStats?.byStatus ?? [],
        breachedCount: caseStats?.breachedCount ?? 0,
        resolvedToday: caseStats?.resolvedToday ?? 0,
        openCount: caseStats?.openCount ?? 0,
      },
      approvals: { pending: approvalPending?.total ?? 0 },
      mdm: {
        total: mdmStats?.total ?? 0,
        active: mdmStats?.active ?? 0,
        inactive: mdmStats?.inactive ?? 0,
        byRegion: mdmStats?.byRegion ?? [],
        byDomain: mdmStats?.byDomain ?? [],
      },
      topCases: topCases?.data ?? [],
      pendingTasks: pendingTasks?.data ?? [],
      generatedAt: new Date().toISOString(),
    };
  }
}
