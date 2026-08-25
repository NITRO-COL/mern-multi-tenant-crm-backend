/**
 * Deterministic demo data.
 *
 * Everything here is generated from a fixed seed, so `npm run seed` produces the
 * same database every time and the credentials in the README stay accurate.
 * The distributions are shaped like a real pipeline — a wide top, a narrow
 * bottom — rather than an even split across statuses, which would make the
 * dashboard charts flat and uninformative.
 */

export const PLATFORM_ADMIN = {
  name: "Platform Operator",
  email: "superadmin@morshcrm.com",
  password: "SuperAdmin@123",
};

export const TENANTS = [
  {
    name: "Acme Corporation",
    slug: "acme",
    seed: 20240117,
    leadCount: 46,
    users: [
      { name: "Aarav Sharma", email: "admin@acme.com", password: "Admin@123", role: "ADMIN" },
      { name: "Priya Nair", email: "sales@acme.com", password: "Sales@123", role: "SALES" },
    ],
  },
  {
    name: "Globex Industries",
    slug: "globex",
    seed: 76451903,
    leadCount: 38,
    users: [
      { name: "Kabir Malhotra", email: "admin@globex.com", password: "Admin@123", role: "ADMIN" },
      { name: "Meera Iyer", email: "sales@globex.com", password: "Sales@123", role: "SALES" },
    ],
  },
];

/* --------------------------------------------------------------------------
   Weighted pools — the weights are what give the charts their shape.
-------------------------------------------------------------------------- */

const STATUS_WEIGHTS = [
  ["NEW", 30],
  ["CONTACTED", 24],
  ["QUALIFIED", 18],
  ["CONVERTED", 15],
  ["LOST", 13],
];

const SOURCE_WEIGHTS = [
  ["WEBSITE", 28],
  ["REFERRAL", 20],
  ["EMAIL_CAMPAIGN", 16],
  ["COLD_CALL", 13],
  ["SOCIAL_MEDIA", 11],
  ["EVENT", 8],
  ["OTHER", 4],
];

const FIRST_NAMES = [
  "Rohit", "Ananya", "Vikram", "Sneha", "Karan", "Divya", "Arjun", "Ishita",
  "Nikhil", "Tanvi", "Rahul", "Pooja", "Siddharth", "Neha", "Aditya", "Ritika",
  "Manav", "Shreya", "Kabir", "Aisha", "Sanjay", "Kavya", "Harsh", "Nandini",
  "Yash", "Lakshmi", "Devansh", "Ira", "Rohan", "Simran", "Aryan", "Trisha",
  "Vivek", "Megha", "Imran", "Riya", "Gaurav", "Aditi", "Farhan", "Sarita",
  "Naveen", "Bhavna", "Tarun", "Charu", "Omkar", "Preeti", "Zoya", "Dhruv",
];

const LAST_NAMES = [
  "Verma", "Gupta", "Desai", "Kulkarni", "Mehta", "Rao", "Malhotra", "Bose",
  "Joshi", "Shah", "Khanna", "Menon", "Roy", "Bajaj", "Pillai", "Sen",
  "Chopra", "Dutta", "Ahuja", "Qureshi", "Patel", "Reddy", "Trivedi", "Ghosh",
];

const COMPANIES = [
  "Nexus Retail", "Ternary Labs", "Bluepeak Logistics", "Orbit Foods",
  "Sunrise Textiles", "Helix Pharma", "Vertex Motors", "Cobalt Media",
  "Prime Estates", "Northwind Travel", "Ironclad Security", "Lumen Analytics",
  "Grainhouse Agro", "Cascade Interiors", "Skyline Aviation", "Everest Fintech",
  "Quartz Ceramics", "Aurora Health", "Redstone Mining", "Willow Publishing",
  "Zenith Systems", "Marlin Shipping", "Copper Ridge", "Silverline Energy",
  "Fernwood Realty", "Trident Chemicals", "Mosaic Software", "Pinnacle Sports",
  "Delta Packaging", "Harbour Foods", "Kestrel Robotics", "Amber Hospitality",
  "Falcon Telecom", "Basalt Constructions", "Vantage Insurance", "Clearwater Utilities",
  "Summit Apparel", "Nova Biotech", "Cedar Furniture", "Junction Rail Tech",
  "Alloy Motors", "Peppercorn Cafes", "Vector Design", "Meridian Legal",
  "Larkspur Events", "Tidewater Marine", "Sable Cosmetics", "Bramble Organics",
];

const NOTES = [
  "Inbound enquiry — asked for a product demo next week.",
  "Referred by an existing customer. Warm intro already made.",
  "Budget confirmed for the next quarter; waiting on procurement.",
  "Evaluating us against two competitors. Price-sensitive.",
  "Wants an on-premise option — flagged to the solutions team.",
  "",
  "",
];

const ACTIVITY_SEEDS = [
  ["CALL", "Intro call", "Walked through the product and the pricing tiers."],
  ["EMAIL", "Sent proposal", "Emailed the detailed proposal with a 14-day validity."],
  ["MEETING", "Requirement workshop", "On-site session to map their current workflow."],
  ["NOTE", "Budget signal", "Mentioned a budget cycle starting next quarter."],
  ["CALL", "Follow-up call", "Checked in on the internal approval status."],
  ["TASK", "Share case study", "Send the logistics-sector case study before Friday."],
  ["EMAIL", "Pricing clarification", "Answered their questions on per-seat pricing."],
  ["MEETING", "Security review", "Their IT team reviewed our tenant-isolation model."],
];

/* --------------------------------------------------------------------------
   Deterministic pseudo-randomness
-------------------------------------------------------------------------- */

/** Mulberry32 — small, fast, and identical across runs for a given seed. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(random, weights) {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1][0];
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function dateDaysAgo(days, random) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(9 + Math.floor(random() * 9), Math.floor(random() * 60), 0, 0);
  return d;
}

/* --------------------------------------------------------------------------
   Builders
-------------------------------------------------------------------------- */

export function buildLeads(spec, userIds) {
  const random = makeRandom(spec.seed);
  const usedEmails = new Set();
  const leads = [];

  for (let i = 0; i < spec.leadCount; i += 1) {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)];
    const company = COMPANIES[(i * 7 + Math.floor(random() * 5)) % COMPANIES.length];

    const name = `${first} ${last}`;
    let email = `${first.toLowerCase()}.${last.toLowerCase()}@${slugify(company)}.com`;
    // Collisions are possible from a small name pool — suffix rather than drop.
    if (usedEmails.has(email)) email = email.replace("@", `${i}@`);
    usedEmails.add(email);

    /**
     * Two thirds of the leads land inside the last 30 days so the trend chart
     * has real shape; the rest tail off across the previous two months.
     */
    const daysAgo = random() < 0.66
      ? Math.floor(random() * 30)
      : 30 + Math.floor(random() * 60);

    leads.push({
      name,
      email,
      phone: `+91 ${String(70 + Math.floor(random() * 29))}${String(Math.floor(random() * 100000000)).padStart(8, "0")}`,
      company,
      status: weightedPick(random, STATUS_WEIGHTS),
      source: weightedPick(random, SOURCE_WEIGHTS),
      // Leave a few unassigned — real pipelines always have some.
      assignedTo: random() < 0.12 ? null : userIds[Math.floor(random() * userIds.length)],
      notes: NOTES[Math.floor(random() * NOTES.length)],
      createdBy: userIds[0],
      createdAt: dateDaysAgo(daysAgo, random),
    });
  }

  return leads;
}

export function buildActivities(spec, leads, userIds) {
  const random = makeRandom(spec.seed + 1);
  const rows = [];

  for (const lead of leads) {
    // Leads further down the funnel have accumulated more touchpoints.
    const base = { NEW: 0, CONTACTED: 1, QUALIFIED: 2, CONVERTED: 3, LOST: 1 }[lead.status] ?? 0;
    const count = base + (random() < 0.4 ? 1 : 0);

    for (let k = 0; k < count; k += 1) {
      const [type, title, description] = ACTIVITY_SEEDS[Math.floor(random() * ACTIVITY_SEEDS.length)];
      const daysAgo = Math.max(0, Math.floor((Date.now() - lead.createdAt.getTime()) / 86400000) - k * 3);

      rows.push({
        type,
        title,
        description,
        leadId: lead._id,
        createdBy: userIds[Math.floor(random() * userIds.length)],
        createdAt: dateDaysAgo(daysAgo, random),
      });
    }
  }

  return rows;
}
