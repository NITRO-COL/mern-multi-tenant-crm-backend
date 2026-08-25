# Database Structure

MongoDB with Mongoose. Six collections, all in a single shared database.

Every CRM record carries a `tenantId`, and every index is led by it. That one
decision is what makes the multi-tenancy both correct and fast.

---

## Overview

```
                        ┌──────────────────┐
                        │     tenants      │   the organizations
                        │  name, slug      │   (not tenant-scoped —
                        │  status          │    they ARE the scope)
                        └────────┬─────────┘
                                 │ tenantId
             ┌───────────────────┼───────────────────┐
             │                   │                   │
        ┌────▼─────┐       ┌─────▼──────┐     ┌──────▼──────┐
        │  users   │       │   leads    │     │  customers  │
        │ role     │       │ status     │     │ status      │
        │ password │       │ source     │     │ owner       │
        └────┬─────┘       └─────┬──────┘     └──────┬──────┘
             │                   │                   │
             │ assignedTo /      │ convertedCustomerId │
             │ owner /           └───────────────────►│
             │ createdBy                              │
             │                   ┌────────────────────┴──┐
             └──────────────────►│      activities       │
                                 │  type, title          │
                                 │  leadId | customerId  │
                                 └───────────────────────┘

        ┌──────────────────┐
        │  platformadmins  │   SaaS operator logins.
        │  email, password │   Deliberately separate, no tenantId.
        └──────────────────┘
```

**Relationships are by `ObjectId` reference, not embedding.** Leads, customers
and activities are all independently queried, filtered, sorted and paginated, and
a tenant's lead list grows without bound — embedding them inside the tenant
document would hit the 16 MB document limit and make paging impossible.

---

## Collections

### `tenants`

One document per organization. This collection is **not** tenant-scoped, because
it defines the scope.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | referenced as `tenantId` everywhere else |
| `name` | String | required, max 120 |
| `slug` | String | required, **globally unique**, lowercase, `[a-z0-9-]` |
| `status` | String | `ACTIVE` \| `SUSPENDED`, default `ACTIVE` |
| `schemaVersion` | Number | default `1` — reserved for per-tenant migrations |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes: `{ slug: 1 }` unique, `{ status: 1 }`

`slug` lets a user disambiguate at login when the same email exists in more than
one organization. A suspended tenant is rejected at authentication, so suspending
an organization instantly cuts off all of its users without touching their records.

---

### `platformadmins`

The SaaS operator's own logins — a **separate collection from `users`**, on purpose.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | required |
| `email` | String | required, globally unique |
| `password` | String | bcrypt hash, `select: false` |
| `isActive` | Boolean | default `true` |

Index: `{ email: 1 }` unique

Keeping platform staff out of the tenant-scoped `users` collection means a bug in
tenant code can never surface or authenticate a platform admin, and a platform
admin has no `tenantId` to leak CRM data through. Their JWT also carries a
different `audience` claim, so the two token types cannot be used against each
other's routes.

---

### `users`

People who log in and belong to exactly one organization.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `tenantId` | ObjectId → `tenants` | **required, immutable** |
| `name` | String | required, max 120 |
| `email` | String | required, lowercase, validated |
| `password` | String | bcrypt hash, `select: false` |
| `role` | String | `ADMIN` \| `SALES`, default `SALES` |
| `isActive` | Boolean | default `true` |
| `createdAt` / `updatedAt` | Date | automatic |

| Index | Purpose |
|---|---|
| `{ tenantId: 1, email: 1 }` **unique** | one account per email **per organization** |
| `{ tenantId: 1, role: 1 }` | role filtering within a tenant |
| `{ tenantId: 1 }` | scope prefix |

Email is unique **within a tenant, not globally**. Two unrelated organizations may
legitimately employ the same person, or use the same shared address — a global
unique index would block the second one from ever signing up.

`password` is `select: false`, so it is excluded from every query unless asked for
explicitly, and a `toJSON` transform strips it a second time.

---

### `leads`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `tenantId` | ObjectId → `tenants` | **required, immutable** |
| `name` | String | required, max 120 |
| `email` | String | required, validated |
| `phone` | String | required, max 20 |
| `company` | String | required, max 160 |
| `status` | String | `NEW` \| `CONTACTED` \| `QUALIFIED` \| `CONVERTED` \| `LOST` |
| `source` | String | `WEBSITE` \| `REFERRAL` \| `COLD_CALL` \| `EMAIL_CAMPAIGN` \| `SOCIAL_MEDIA` \| `EVENT` \| `OTHER` |
| `assignedTo` | ObjectId → `users` | nullable |
| `notes` | String | max 2000 |
| `convertedCustomerId` | ObjectId → `customers` | set on conversion |
| `convertedAt` | Date | set on conversion |
| `createdBy` | ObjectId → `users` | required |
| `createdAt` / `updatedAt` | Date | automatic |

| Index | Serves |
|---|---|
| `{ tenantId: 1, createdAt: -1 }` | default list, newest first |
| `{ tenantId: 1, status: 1, createdAt: -1 }` | status filter + sort |
| `{ tenantId: 1, source: 1 }` | source breakdown on the dashboard |
| `{ tenantId: 1, assignedTo: 1, createdAt: -1 }` | "my leads" |
| `{ tenantId: 1, email: 1 }` **unique** | no duplicate lead per organization |
| `{ tenantId: 1, name: 1 }` | sort by name |

`assignedTo` is validated against `users` **in the same tenant** before it is
written, so a lead can never be assigned to someone from another organization.

---

### `customers`

Same shape as a lead, minus the pipeline fields.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `tenantId` | ObjectId → `tenants` | **required, immutable** |
| `name`, `email`, `phone`, `company` | String | all required |
| `status` | String | `ACTIVE` \| `INACTIVE` \| `CHURNED` |
| `owner` | ObjectId → `users` | account owner, nullable |
| `convertedFromLeadId` | ObjectId → `leads` | provenance, nullable |
| `notes` | String | max 2000 |
| `createdBy` | ObjectId → `users` | required |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes mirror `leads`: `{ tenantId, createdAt }`, `{ tenantId, status, createdAt }`,
`{ tenantId, owner, createdAt }`, `{ tenantId, email }` unique, `{ tenantId, name }`.

`convertedFromLeadId` and the lead's `convertedCustomerId` point at each other, so
the conversion is traceable from either side.

---

### `activities`

Calls, meetings, emails, notes and tasks logged against a lead **or** a customer.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `tenantId` | ObjectId → `tenants` | **required, immutable** |
| `type` | String | `CALL` \| `MEETING` \| `EMAIL` \| `NOTE` \| `TASK` |
| `title` | String | required, max 200 |
| `description` | String | max 2000 |
| `leadId` | ObjectId → `leads` | nullable |
| `customerId` | ObjectId → `customers` | nullable |
| `dueAt` | Date | nullable, used by `TASK` |
| `createdBy` | ObjectId → `users` | required |
| `createdAt` / `updatedAt` | Date | automatic |

| Index | Serves |
|---|---|
| `{ tenantId: 1, leadId: 1, createdAt: -1 }` | a lead's timeline |
| `{ tenantId: 1, customerId: 1, createdAt: -1 }` | a customer's timeline |
| `{ tenantId: 1, type: 1, createdAt: -1 }` | type breakdown |
| `{ tenantId: 1, createdAt: -1 }` | recent activity |

Exactly one of `leadId` / `customerId` is set — enforced in the validation layer
rather than by the schema, since Mongoose cannot express "exactly one of these".
The parent record is resolved **tenant-scoped** before an activity is written or
read, so activities cannot be attached to another organization's lead by guessing
its id.

---

## Why every index starts with `tenantId`

`tenantId` is an equality match on literally every query the application makes.
Putting it first lets MongoDB seek straight to one organization's slice of the
collection instead of scanning everything and filtering afterwards.

```js
// index: { tenantId: 1, status: 1, createdAt: -1 }
db.leads.find({ tenantId, status: "QUALIFIED" }).sort({ createdAt: -1 })
```

The remaining fields follow the **ESR rule** — Equality, then Sort, then Range:

| Position | Field | Why |
|---|---|---|
| 1 | `tenantId` | equality, on every single query |
| 2 | `status` | equality, when filtering |
| 3 | `createdAt` | the sort key |

An index led by `status` instead would force MongoDB to read every organization's
qualified leads before discarding all but one tenant's — the query would still be
correct, but it would get slower as other customers signed up.

---

## Tenant isolation at the data layer

Three things enforce it in the schema itself:

1. **`tenantId` is `required` and `immutable`.** A record cannot be created
   without one, and cannot be moved between organizations afterwards — not even
   by a direct update.

2. **A Mongoose plugin guards every query.** It throws if any `find`, `update`,
   `delete` or `aggregate` reaches the driver without a `tenantId` filter.
   Deliberate exceptions — login by email, seeding, the platform admin's tenant
   list — opt out explicitly.

3. **Compound unique indexes are scoped.** `{ tenantId, email }` rather than
   `{ email }`, so uniqueness is enforced inside an organization without leaking
   the existence of records in another.

Every reporting aggregation also opens with `$match: { tenantId }`, which is both
the correctness requirement and the reason the pipelines stay index-backed.

---

## Seeded demo data

`npm run seed` builds two fully populated, isolated organizations:

| | Acme Corporation | Globex Industries |
|---|---|---|
| Users | 2 (ADMIN + SALES) | 2 (ADMIN + SALES) |
| Leads | 46 | 38 |
| Customers | 4 | 8 |
| Activities | 69 | 62 |

Statuses and sources are weighted rather than evenly distributed, so the pipeline
has a realistic funnel shape and the dashboard charts show something meaningful.
The generator is seeded with a fixed value, so re-running produces the same
database every time.
