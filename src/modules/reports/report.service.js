import * as reportRepo from "./report.repository.js";

/**
 * Dashboard payload.
 *
 * At this scale three concurrent aggregations are fine. The documented path to
 * scale (see README) is a pre-aggregated `tenant_stats` rollup updated by $inc
 * on status change, turning this endpoint into a single findOne.
 */
export async function getDashboard(tenantId) {
  const [leads, customers, activities] = await Promise.all([
    reportRepo.leadStats(tenantId),
    reportRepo.customerStats(tenantId),
    reportRepo.activityStats(tenantId),
  ]);

  const statusCount = (key) => leads.byStatus.find((s) => s.key === key)?.count ?? 0;

  return {
    kpis: {
      totalLeads: leads.total,
      newLeads: statusCount("NEW"),
      contactedLeads: statusCount("CONTACTED"),
      qualifiedLeads: statusCount("QUALIFIED"),
      convertedLeads: statusCount("CONVERTED"),
      lostLeads: statusCount("LOST"),
      totalCustomers: customers.total,
      totalActivities: activities.total,
      conversionRate: leads.total ? Number(((statusCount("CONVERTED") / leads.total) * 100).toFixed(1)) : 0,
    },
    charts: {
      leadsByStatus: leads.byStatus,
      leadsBySource: leads.bySource.filter((s) => s.count > 0),
      customersByStatus: customers.byStatus,
      activitiesByType: activities.byType,
      leadsTrend: leads.trend,
    },
    recentLeads: leads.recent,
  };
}
