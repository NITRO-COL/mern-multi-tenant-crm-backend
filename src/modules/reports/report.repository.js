import mongoose from "mongoose";
import { Lead, LEAD_STATUSES, LEAD_SOURCES } from "../leads/lead.model.js";
import { Customer } from "../customers/customer.model.js";
import { Activity } from "../activities/activity.model.js";

/**
 * Reporting aggregations — tenant isolation Layer 2, aggregation flavour.
 *
 * Every pipeline opens with `$match: { tenantId }`. That is not only correctness
 * but performance: the leading $match is index-backed (tenantId is the prefix of
 * every index), so the pipeline reads one organization's slice instead of
 * scanning the collection and filtering afterwards.
 */

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

export async function leadStats(tenantId) {
  const tid = toObjectId(tenantId);

  /**
   * $facet runs every sub-pipeline over the same matched set in ONE round trip,
   * instead of six separate queries from the API server.
   */
  const [result] = await Lead.aggregate([
    { $match: { tenantId: tid } },
    {
      $facet: {
        total: [{ $count: "value" }],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        bySource: [{ $group: { _id: "$source", count: { $sum: 1 } } }],
        recent: [
          { $sort: { createdAt: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "assignedTo",
              foreignField: "_id",
              as: "assignee",
              // The lookup is scoped too — a dangling ref can never pull in a
              // user document from another tenant.
              pipeline: [{ $match: { tenantId: tid } }, { $project: { name: 1, email: 1 } }],
            },
          },
          {
            $project: {
              name: 1, email: 1, company: 1, status: 1, source: 1, createdAt: 1,
              assignedTo: { $first: "$assignee" },
            },
          },
        ],
        createdLast30Days: [
          { $match: { createdAt: { $gte: daysAgo(30) } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        // The preceding window, so a KPI can say "up 12%" instead of just "46".
        createdPrev30Days: [
          { $match: { createdAt: { $gte: daysAgo(60), $lt: daysAgo(30) } } },
          { $count: "value" },
        ],
      },
    },
  ]);

  const trend = fillDateGaps(result.createdLast30Days, 30);

  return {
    total: result.total[0]?.value ?? 0,
    byStatus: fillBuckets(result.byStatus, LEAD_STATUSES),
    bySource: fillBuckets(result.bySource, LEAD_SOURCES),
    recent: result.recent,
    trend,
    createdLast30: trend.reduce((sum, d) => sum + d.count, 0),
    createdPrev30: result.createdPrev30Days[0]?.value ?? 0,
  };
}

export async function customerStats(tenantId) {
  const tid = toObjectId(tenantId);

  const [result] = await Customer.aggregate([
    { $match: { tenantId: tid } },
    {
      $facet: {
        total: [{ $count: "value" }],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        createdLast30: [{ $match: { createdAt: { $gte: daysAgo(30) } } }, { $count: "value" }],
        createdPrev30: [
          { $match: { createdAt: { $gte: daysAgo(60), $lt: daysAgo(30) } } },
          { $count: "value" },
        ],
      },
    },
  ]);

  return {
    total: result.total[0]?.value ?? 0,
    byStatus: fillBuckets(result.byStatus, ["ACTIVE", "INACTIVE", "CHURNED"]),
    createdLast30: result.createdLast30[0]?.value ?? 0,
    createdPrev30: result.createdPrev30[0]?.value ?? 0,
  };
}

export async function activityStats(tenantId) {
  const tid = toObjectId(tenantId);

  const [result] = await Activity.aggregate([
    { $match: { tenantId: tid } },
    {
      $facet: {
        total: [{ $count: "value" }],
        byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
      },
    },
  ]);

  return {
    total: result.total[0]?.value ?? 0,
    byType: result.byType.map((b) => ({ key: b._id, count: b.count })),
  };
}

/**
 * $group only emits buckets that exist. The UI wants every status/source present
 * (a zero bar is information), so absent keys are filled in at zero here.
 */
function fillBuckets(rows, allKeys) {
  const found = new Map(rows.map((r) => [r._id, r.count]));
  return allKeys.map((key) => ({ key, count: found.get(key) ?? 0 }));
}

/**
 * $group emits only the days that had records. A sparkline needs a value for
 * every day, otherwise gaps compress the line and misrepresent the shape.
 */
function fillDateGaps(rows, days) {
  const found = new Map(rows.map((r) => [r._id, r.count]));
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: found.get(key) ?? 0 });
  }
  return out;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
