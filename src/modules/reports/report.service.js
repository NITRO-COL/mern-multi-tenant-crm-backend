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
    deltas: {
      leads: percentChange(leads.createdLast30, leads.createdPrev30),
      customers: percentChange(customers.createdLast30, customers.createdPrev30),
    },
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

/**
 * Change between two periods, as a signed percentage.
 *
 * Growth from zero has no percentage — 0 -> 5 is not "500% up", it is "new".
 * Returning null lets the UI say something honest instead of printing Infinity.
 */
function percentChange(current, previous) {
  if (!previous) return { current, previous, percent: null, direction: current > 0 ? "up" : "flat" };

  const percent = Number((((current - previous) / previous) * 100).toFixed(1));
  return {
    current,
    previous,
    percent,
    direction: percent > 0 ? "up" : percent < 0 ? "down" : "flat",
  };
}
