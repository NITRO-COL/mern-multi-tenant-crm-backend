# Morsh CRM — Multi-Tenant CRM

A production-style CRM where several independent organizations share one deployment and
one database, and **no organization can ever see or modify another's data**.

Built with Next.js, Express, MongoDB and JWT authentication.

```
┌────────────────┐      JWT (tenantId + role)      ┌────────────────┐
│  Next.js 16    │ ──────────────────────────────► │  Express API   │
│  React 19      │                                 │  Node.js 20+   │
│  Tailwind v4   │ ◄────────────────────────────── │  Mongoose 8    │
└────────────────┘      { success, data, meta }    └───────┬────────┘
                                                           │ every query
                                                           │ scoped by tenantId
                                                   ┌───────▼────────┐
                                                   │    MongoDB     │
                                                   └────────────────┘
```

---

## Table of contents

- [Quick start](#quick-start)
- [Test credentials](#test-credentials)
- [Verify tenant isolation in 60 seconds](#verify-tenant-isolation-in-60-seconds)
- [Environment variables](#environment-variables)
- [Tenant isolation — the approach](#tenant-isolation--the-approach)
- [Authorization model](#authorization-model)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [Scaling considerations](#scaling-considerations)

---

## Quick start

**Requirements:** Node.js 20+, and a MongoDB connection string (a free
[Atlas](https://www.mongodb.com/cloud/atlas/register) M0 cluster works).

The project is split across two repositories:

| Repository | Contents |
|---|---|
| [`mern-multi-tenant-crm-backend`](https://github.com/NITRO-COL/mern-multi-tenant-crm-backend) | Express API, MongoDB models, tests, Postman collection |
| [`mern-multi-tenant-crm-frontend`](https://github.com/NITRO-COL/mern-multi-tenant-crm-frontend) | Next.js application |

### 1. Backend (this repository)

```bash
git clone https://github.com/NITRO-COL/mern-multi-tenant-crm-backend.git
cd mern-multi-tenant-crm-backend
npm install
cp .env.example .env          # then edit MONGODB_URI and JWT_SECRET
npm run seed                  # creates 2 tenants + users + demo records
npm run dev                   # http://localhost:5000
```

Generate a strong secret for `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Frontend

```bash
git clone https://github.com/NITRO-COL/mern-multi-tenant-crm-frontend.git
cd mern-multi-tenant-crm-frontend
npm install
cp .env.example .env.local    # defaults to http://localhost:5000
npm run dev                   # http://localhost:3000
```

Open <http://localhost:3000> and sign in with any account below.

### 3. Run the security tests

```bash
npm test
```

27 automated tests spin up an in-memory MongoDB, seed two organizations, and assert that
every cross-tenant access attempt fails. No external database required.

---

## Test credentials

Two fully isolated organizations, each with an ADMIN and a SALES user.
The login screen has a one-click **Demo accounts** panel with all of these.

| Organization | Role | Email | Password |
|---|---|---|---|
| **Acme Corporation** | ADMIN | `admin@acme.com` | `Admin@123` |
| **Acme Corporation** | SALES | `sales@acme.com` | `Sales@123` |
| **Globex Industries** | ADMIN | `admin@globex.com` | `Admin@123` |
| **Globex Industries** | SALES | `sales@globex.com` | `Sales@123` |

Platform operator (manages tenants, has **no** access to any CRM data):

| Role | Email | Password | Endpoint |
|---|---|---|---|
| SUPER_ADMIN | `superadmin@morshcrm.com` | `SuperAdmin@123` | `POST /api/auth/platform/login` |

---

## Verify tenant isolation in 60 seconds

The fastest check, entirely from the terminal:

```bash
# 1. Log in as both organizations
ACME=$(curl -s -X POST localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.com","password":"Admin@123"}' | jq -r .data.token)

GLOBEX=$(curl -s -X POST localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@globex.com","password":"Admin@123"}' | jq -r .data.token)

# 2. Grab the id of a lead that belongs to Acme
LEAD=$(curl -s localhost:5000/api/leads -H "Authorization: Bearer $ACME" | jq -r .data[0]._id)

# 3. Try to reach it as Globex — all three must return 404
curl -s -o /dev/null -w "GET    %{http_code}\n" localhost:5000/api/leads/$LEAD -H "Authorization: Bearer $GLOBEX"
curl -s -o /dev/null -w "PUT    %{http_code}\n" -X PUT    localhost:5000/api/leads/$LEAD -H "Authorization: Bearer $GLOBEX" -H 'Content-Type: application/json' -d '{"name":"hijacked"}'
curl -s -o /dev/null -w "DELETE %{http_code}\n" -X DELETE localhost:5000/api/leads/$LEAD -H "Authorization: Bearer $GLOBEX"

# 4. A SALES user must not be able to delete — expect 403
SALES=$(curl -s -X POST localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sales@acme.com","password":"Sales@123"}' | jq -r .data.token)
curl -s -o /dev/null -w "SALES DELETE %{http_code}\n" -X DELETE localhost:5000/api/leads/$LEAD -H "Authorization: Bearer $SALES"
```

Expected output:

```
GET    404
PUT    404
DELETE 404
SALES DELETE 403
```

Or run `npm test` in `server/`, which automates all of the above plus 23 more cases.

---

## Environment variables

### `server/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `5000` | API port |
| `MONGODB_URI` | **yes** | — | MongoDB connection string |
| `JWT_SECRET` | **yes** | — | Signing key — **minimum 32 characters** |
| `JWT_EXPIRES_IN` | no | `7d` | Access token lifetime |
| `BCRYPT_ROUNDS` | no | `10` | Password hashing cost (8–15) |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Comma-separated allowed origins |

The server validates this schema on boot and **refuses to start** if anything is missing
or malformed — a misconfigured secret fails loudly at startup rather than silently at
runtime.

### `client/.env.local`

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | no | `http://localhost:5000` | API base URL, no trailing slash and no `/api` suffix |

---

## Tenant isolation — the approach

Tenant isolation is the primary requirement, so it is enforced at **four independent
layers**. Any one of them would work on a good day; together they mean a single mistake
does not become a data breach.

### Layer 1 — `tenantId` comes from the token, never from the client

`req.tenantId` is assigned in exactly one place — the `authenticate` middleware — from the
verified JWT payload:

```js
// server/src/middleware/authenticate.js
const payload = verifyToken(token, AUDIENCE.TENANT);
const user = await User.findOne({ _id: payload.sub, tenantId: payload.tid }).lean();

req.tenantId = String(user.tenantId);   // single source of truth
```

Nothing downstream reads a tenant id from `req.body`, `req.query` or `req.params`.
Every request body schema is declared with Zod's `.strip()`, so a client-supplied
`tenantId` is **silently discarded before validation completes** — it never reaches a
controller, let alone a query.

### Layer 2 — the repository layer makes the scope non-optional

Controllers and services never touch a Mongoose model directly. All database access goes
through a repository whose every function takes `tenantId` as its **first argument**:

```js
// server/src/modules/leads/lead.repository.js
export function findById(tenantId, id) {
  return Lead.findOne({ _id: id, tenantId });
}

export function update(tenantId, id, data) {
  return Lead.findOneAndUpdate({ _id: id, tenantId }, { $set: data }, { new: true });
}

export function remove(tenantId, id) {
  return Lead.findOneAndDelete({ _id: id, tenantId });
}
```

An un-scoped read or write is not something a caller can express. When a user from
Tenant B supplies the id of a Tenant A record, the filter matches zero documents and the
service throws **404**.

### Layer 3 — a Mongoose plugin that refuses un-scoped queries

The safety net. Every tenant-owned model loads `tenantPlugin`, which throws if a query
somehow reaches the driver without a tenant filter:

```js
// server/src/shared/tenantPlugin.js
schema.pre(GUARDED_QUERY_OPS, function () {
  if (this.getOptions().skipTenantScope) return;

  if (this.getFilter().tenantId == null) {
    throw new Error(`[TENANT-ISOLATION] ${this.model.modelName}.${this.op}() without tenantId`);
  }
});

schema.pre("aggregate", function () {
  const [first] = this.pipeline();
  if (first?.$match?.tenantId === undefined) {
    throw new Error("[TENANT-ISOLATION] aggregate() must begin with $match on tenantId");
  }
});
```

Deliberate exceptions (login by email, seeding, the platform admin's tenant list) opt out
explicitly with `.setOptions({ skipTenantScope: true })`, so every unscoped query reads as
a conscious decision rather than a forgotten filter.

> **This layer earned its place on the first test run.** It caught a real leak:
> `.populate("assignedTo")` issues `User.find({ _id: { $in: [...] } })` with no tenant
> filter — a stored reference would have been resolved against the entire users
> collection. Every populate is now `scopedPopulate(tenantId, path, select)`, which
> re-applies the scope through Mongoose's `match` option, so a reference pointing outside
> the tenant resolves to `null` instead of leaking a foreign document.

### Layer 4 — automated tests that try to break it

`server/tests/tenant-isolation.test.js` seeds two organizations and then attacks the
boundary from every angle: 27 tests covering cross-tenant GET/PUT/DELETE on leads,
customers and activities; injected `tenantId` in create and update payloads; cross-tenant
user assignment; role escalation; token-audience confusion; and tenant-scoped reporting.

```
Tests: 27 passed, 27 total
```

### Why 404 and not 403

Cross-tenant access returns **404 Not Found**, never 403 Forbidden. A 403 would confirm
that the record exists — turning the API into an oracle an attacker could use to
enumerate another organization's record ids. From Tenant B's perspective, a Tenant A
record simply does not exist.

`403` is reserved for its actual meaning: *you are authenticated, this resource is yours,
your role may not perform this action* — for example a SALES user attempting a delete.

### Separate token audiences

The platform operator and tenant users are issued tokens with different JWT `audience`
claims (`crm:platform` vs `crm:tenant`), and platform admins live in a **separate
collection** with no `tenantId` at all. A platform token cannot be replayed against a CRM
route and a tenant token cannot reach `/api/platform/*` — both return 401, and both cases
are covered by tests.

---

## Authorization model

Three roles, defined in one table (`server/src/config/permissions.js`) rather than as
scattered `if (role === ...)` checks:

| Capability | SUPER_ADMIN | ADMIN | SALES |
|---|:--:|:--:|:--:|
| Create / list / suspend tenants | ✅ | ❌ | ❌ |
| View leads, customers, activities | ❌ | ✅ | ✅ |
| Create / update leads & customers | ❌ | ✅ | ✅ |
| **Delete leads & customers** | ❌ | ✅ | **❌ 403** |
| Convert a lead to a customer | ❌ | ✅ | ✅ |
| View the dashboard | ❌ | ✅ | ✅ |
| Manage users in own tenant | ❌ | ✅ | ❌ |

Guards are declared at the route:

```js
router.delete("/:id", authenticate, can("lead:delete"), validate(schema), controller.remove);
```

The frontend mirrors this table to hide affordances a user cannot use, but that is
**UX only** — the server re-checks every request, so forging the client-side state gains
nothing.

---

## API reference

Base URL: `http://localhost:5000/api`.
All protected routes require `Authorization: Bearer <token>`.

A ready-to-import **Postman collection** is at
[`postman/Morsh-CRM.postman_collection.json`](./postman) together with an environment
file. It includes a **Security / cross-tenant** folder that reproduces the acceptance
tests from the brief with one click.

### Response envelope

Every response shares one shape, so the client never guesses:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 46, ... } }

// failure
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Lead not found" } }
```

| Status | When |
|---|---|
| `200` / `201` / `204` | Success |
| `400` | Validation failed (`error.details` lists the offending fields) |
| `401` | Missing, malformed or expired token |
| `403` | Authenticated, but the role lacks the permission |
| `404` | Not found — **including any cross-tenant access attempt** |
| `409` | Duplicate (e.g. a lead with that email already exists in this tenant) |
| `429` | Rate limited |
| `500` | Unexpected server error (never leaks a stack trace in production) |

### Endpoints

#### Auth

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/auth/login` | — | Email + password → JWT. Optional `tenantSlug` disambiguates a shared email |
| `POST` | `/auth/platform/login` | — | Platform operator login |
| `GET` | `/auth/me` | any | Current user + tenant |
| `POST` | `/auth/users` | ADMIN | Create a user inside the caller's tenant |

#### Leads

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/leads` | ADMIN, SALES | List — search, filter, sort, paginate |
| `POST` | `/leads` | ADMIN, SALES | Create |
| `GET` | `/leads/:id` | ADMIN, SALES | Single lead |
| `PUT` | `/leads/:id` | ADMIN, SALES | Update |
| `DELETE` | `/leads/:id` | **ADMIN only** | Delete |
| `POST` | `/leads/:id/convert` | ADMIN, SALES | Promote a `CONVERTED` lead into a customer |

Query parameters for `GET /leads`:

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int | `1` | |
| `limit` | int | `10` | capped at 100 |
| `search` | string | — | matches name, email, company or phone |
| `status` | enum | — | `NEW` `CONTACTED` `QUALIFIED` `CONVERTED` `LOST` |
| `source` | enum | — | `WEBSITE` `REFERRAL` `COLD_CALL` `EMAIL_CAMPAIGN` `SOCIAL_MEDIA` `EVENT` `OTHER` |
| `assignedTo` | ObjectId | — | must be a user in the same tenant |
| `sortBy` | enum | `createdAt` | whitelisted fields only |
| `sortOrder` | enum | `desc` | `asc` \| `desc` |

```
GET /api/leads?page=1&limit=10&search=raj&status=QUALIFIED&sortBy=name&sortOrder=asc
```

#### Customers

| Method | Path | Role |
|---|---|---|
| `GET` | `/customers` | ADMIN, SALES |
| `POST` | `/customers` | ADMIN, SALES |
| `GET` | `/customers/:id` | ADMIN, SALES |
| `PUT` | `/customers/:id` | ADMIN, SALES |
| `DELETE` | `/customers/:id` | **ADMIN only** |

Supports `page`, `limit`, `search`, `status`, `owner`, `sortBy`, `sortOrder`.

#### Activities

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/activities` | ADMIN, SALES | Create against a lead **or** a customer (exactly one) |
| `GET` | `/activities/:recordId` | ADMIN, SALES | Timeline for a lead or customer id |
| `DELETE` | `/activities/:id` | **ADMIN only** | Delete |

#### Reports

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/reports/dashboard` | ADMIN, SALES | KPIs, status/source breakdowns, 30-day trend, recent leads |

#### Users & platform

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/users` | ADMIN, SALES | Colleagues in the caller's tenant (assignment pickers) |
| `GET` | `/platform/tenants` | SUPER_ADMIN | All tenants with record counts |
| `POST` | `/platform/tenants` | SUPER_ADMIN | Create a tenant + its first ADMIN |
| `PATCH` | `/platform/tenants/:id/status` | SUPER_ADMIN | Activate / suspend a tenant |

---

## Data model

| Collection | Fields | Tenant-scoped |
|---|---|:--:|
| `tenants` | `name`, `slug` (unique), `status`, `schemaVersion`, `createdAt` | — (it *is* the scope) |
| `platformadmins` | `name`, `email` (unique), `password`, `isActive` | — (no tenant) |
| `users` | `tenantId`, `name`, `email`, `password`, `role`, `isActive` | ✅ |
| `leads` | `tenantId`, `name`, `email`, `phone`, `company`, `status`, `source`, `assignedTo`, `notes`, `convertedCustomerId`, `createdBy`, `createdAt` | ✅ |
| `customers` | `tenantId`, `name`, `email`, `phone`, `company`, `status`, `owner`, `convertedFromLeadId`, `notes`, `createdBy`, `createdAt` | ✅ |
| `activities` | `tenantId`, `type`, `title`, `description`, `leadId`/`customerId`, `dueAt`, `createdBy`, `createdAt` | ✅ |

### Index strategy

**Every index leads with `tenantId`.**

`tenantId` is an equality match on literally every query, so putting it first lets MongoDB
seek straight to one organization's slice of the collection instead of scanning everything
and filtering afterwards. Remaining fields follow the **ESR rule** — Equality, then Sort,
then Range.

```js
// leads
{ tenantId: 1, createdAt: -1 }                 // default list + sort
{ tenantId: 1, status: 1, createdAt: -1 }      // status filter + sort
{ tenantId: 1, source: 1 }                     // source reporting
{ tenantId: 1, assignedTo: 1, createdAt: -1 }  // "my leads"
{ tenantId: 1, email: 1 }  unique              // no duplicate lead per tenant
{ tenantId: 1, name: 1 }                       // name sort

// users
{ tenantId: 1, email: 1 }  unique              // email unique WITHIN a tenant
```

Note that `users.email` is unique **per tenant**, not globally — two unrelated
organizations may legitimately employ the same person or use the same shared address.

---

## Project structure

```
.
├── src/
│   ├── config/          env validation, database, RBAC permission table
│   ├── middleware/      authenticate · authorize · validate · errorHandler
│   ├── modules/         ← one folder per feature, not per layer
│   │   ├── auth/        routes · controller · service · validation
│   │   ├── leads/       routes · controller · service · repository · model · validation
│   │   ├── customers/   (same six files)
│   │   ├── activities/  (same six files)
│   │   ├── reports/     aggregation pipelines
│   │   ├── users/
│   │   └── tenants/     platform-operator module
│   ├── shared/          ApiError · asyncHandler · ApiResponse · tenantPlugin · tokens
│   ├── seed/            deterministic demo data
│   ├── app.js           middleware + route wiring
│   └── server.js        bootstrap + graceful shutdown
├── tests/               cross-tenant security suite
└── postman/             collection + environment
```

The frontend lives in its own repository — see
[`mern-multi-tenant-crm-frontend`](https://github.com/NITRO-COL/mern-multi-tenant-crm-frontend).

**Backend: layered, inside a modular monolith.**
Route → middleware → controller → service → repository → model. Controllers only translate
HTTP; services hold business rules and know nothing about `req`/`res`; repositories are the
only code that touches Mongoose. Folders are grouped by **feature**, so `modules/leads/` can
be lifted into its own service later without hunting through four layer-shaped directories.

---

## Design decisions

**404 instead of 403 on cross-tenant access.** Explained above — a 403 confirms the record
exists and turns the API into an id-enumeration oracle.

**A Mongoose plugin as a third safety net.** Layers 1 and 2 depend on developers
remembering the rule. The plugin makes forgetting it a loud, immediate failure in
development and CI instead of a silent leak in production. It found a real bug on day one.

**Repositories take `tenantId` first, not last, not optional.** Making the scope a
required leading parameter means an un-scoped call does not compile in the reader's head —
it is visibly wrong at the call site.

**Platform admins in a separate collection with a separate token audience.** Keeping the
SaaS operator out of the tenant-scoped `users` collection means a bug in tenant code can
never authenticate or surface a platform admin, and the operator has no `tenantId` to leak
CRM data through. They manage organizations; they do not get a backdoor into customer data.

**Search input is regex-escaped.** A raw `$regex` built from user input accepts `(a+)+$`
(catastrophic backtracking — ReDoS) and `.*` (turning a scoped search into a full scan).
Every term is escaped before it becomes a pattern.

**Sort fields are whitelisted.** An arbitrary `sortBy` string lets a client sort by an
unindexed field and quietly force a collection scan.

**Server-side pagination everywhere, `limit` capped at 100.** The browser never receives
more than one page. Filtering, searching and sorting all happen in MongoDB.

**Zod `.strip()` on every request body.** Unknown keys are dropped rather than rejected —
which is precisely how a client-supplied `tenantId`, `createdBy` or `convertedCustomerId`
gets discarded before it can do damage.

**One envelope for every response.** `{ success, data, meta }` / `{ success, error }` means
the frontend has one code path for reading results and one for handling failures.

**Errors normalise at a single exit point.** A Mongoose `CastError` (malformed ObjectId)
becomes a 404, not a 500 — probing ids reveals nothing. Duplicate-key errors become 409s
with the tenant key filtered out of the message. Unknown errors log in full server-side and
return a bare 500.

**Tailwind v4 with CSS custom properties, not a JS config.** Light and dark are two token
blocks; every component reads roles (`--surface`, `--text-muted`) rather than raw colours,
so the theme swaps in one place.

**Tables become cards below `lg`.** An eight-column table is unreadable on a phone, and a
page that scrolls sideways reads as broken. The leads and customers tables render a card
list at mobile widths instead of shrinking.

**Chart colours are validated, not eyeballed.** Pipeline stages use an ordinal single-hue
ramp (further along the pipeline → further from the page surface) with `LOST` deliberately
outside it in the de-emphasis grey; single-series charts use one colour and no legend,
because the axis already names every bar. Both modes were checked for lightness
monotonicity, step separation and contrast against their own surface.

---

## Scaling considerations

Not implemented — the brief explicitly prefers a simple, reliable implementation — but
these are the paths this design is set up to take.

### Multi-tenancy strategy

This project uses **shared database, shared collection, row-level `tenantId`** — the right
choice at this scale. At real scale the answer is **hybrid**: the long tail of small
tenants stays in the shared pool, while large or enterprise tenants are moved to their own
database, with the connection string recorded on the `Tenant` document and resolved by
middleware. Isolation improves, noisy-neighbour effects disappear, and per-tenant backup,
restore and migration become possible.

### Search

Regex search does not use an index, and `$options: "i"` makes it worse. The upgrade path:

1. Prefix-anchored regex (`/^term/`) with a collation — index-eligible, but only matches
   from the start of a field.
2. A compound text index (`{ tenantId: 1, name: "text", … }`) — note MongoDB allows only
   one text index per collection.
3. **Atlas Search / Elasticsearch** for fuzzy matching, typo tolerance and relevance
   ranking. Tenant isolation still applies: the `tenantId` `filter` clause is mandatory and
   belongs inside a wrapper that injects it, because forgetting it there leaks the whole
   platform.

Plus: debounce the input, require a minimum term length, and store a normalised
lowercase copy of searchable fields so a case-sensitive index can serve the query.

### Pagination

`skip(n)` is O(n) — page 1 is instant, page 9,000 times out. Cursor (keyset) pagination
(`createdAt < lastSeen`) is O(limit) at any depth. `countDocuments` on every request is the
other half of the problem: cache the total, use `estimatedDocumentCount`, or drop the total
and expose next/previous only.

### Reporting

Three aggregations per dashboard load is fine today and fatal at millions of rows. The path:
cache the response in Redis per tenant; then maintain a **pre-aggregated `tenant_stats`
rollup** updated with `$inc` when a lead changes status (or on a schedule via `$merge`, or
from a change stream), turning the dashboard into a single `findOne`. Route reports to a
read replica so analytics never competes with writes.

### Sharding

Shard key `{ tenantId: 1, _id: 1 }`, not hashed `tenantId` alone: a compound key lets a
single large tenant split across chunks instead of becoming one jumbo chunk pinned to one
shard.

### Zero-downtime migrations on a shared database

The hardest problem with a shared collection: one bad `updateMany` locks millions of
documents across every tenant at once.

1. **MongoDB is schemaless — exploit it.** Adding a field is free and needs no migration.
   Never rename or drop in place; only add. That avoids most migrations entirely.
2. **Expand → Migrate → Contract.** Three separate deploys. *Expand:* add the new field,
   write to both old and new, keep reading the old. *Migrate:* a background worker
   backfills in batches with sleeps and a resumable checkpoint. *Contract:* switch reads
   over, observe, then drop the old field. The site stays up throughout because both
   schemas are valid simultaneously, and each phase rolls back independently.
3. **Schema versioning with migrate-on-read.** A `schemaVersion` on each document; upgrade
   lazily when a document is touched. No bulk migration at all — and cold data that is
   never read is never migrated, which costs nothing.
4. **Per-tenant rollout.** `Tenant.schemaVersion` (already in the model) plus a feature
   flag lets a migration run one organization at a time — canary first, then in waves. A
   failure hits **one** tenant instead of all of them. This is the single biggest lever for
   shrinking blast radius on a shared database.
5. **Rolling index builds.** Build on secondaries one at a time, then step down the
   primary — no user-visible impact even on a large collection.
6. **Migrations must be idempotent and resumable**, deployed behind blue-green or rolling
   releases where old and new application code both understand both document shapes.

### Noisy neighbours

Per-tenant rate limiting (Redis token bucket), per-query `maxTimeMS`, and plan-based limits
stop one organization from consuming the cluster. Large tenants graduating to a dedicated
database is the structural version of the same fix.

---

## Deployment

The API deploys to Render and the frontend to Vercel, both on free tiers.

### Backend → Render

1. **Render → New → Blueprint**, select this repository. `render.yaml` supplies the
   build command, start command and health check.
2. Set the two secrets marked `sync: false` in the dashboard:
   - `MONGODB_URI` — the Atlas connection string
   - `CORS_ORIGIN` — the Vercel URL (fill this in after step 2 below)
   `JWT_SECRET` is generated by Render; you never handle it.
3. In **Atlas → Network Access**, allow Render's egress. The free plan has no static
   IP, so `0.0.0.0/0` is the practical option — the database is still protected by
   SRV credentials.
4. Seed the deployed database once, from your machine, pointing at the same cluster:
   ```bash
   MONGODB_URI="<atlas-uri>" npm run seed
   ```
5. Verify: `curl https://<your-service>.onrender.com/health`

> The free instance sleeps after inactivity, so the first request can take ~30 seconds.
> Worth mentioning to anyone you share the link with.

### Frontend → Vercel

1. **Vercel → Add New → Project**, import the
   [frontend repository](https://github.com/NITRO-COL/mern-multi-tenant-crm-frontend).
   Next.js is detected automatically; no build configuration needed.
2. Add one environment variable:
   `NEXT_PUBLIC_API_URL = https://<your-service>.onrender.com`
3. Deploy, then go back to Render and set `CORS_ORIGIN` to the Vercel URL
   (`https://<project>.vercel.app`). Redeploy the API so it picks the value up.

### Order of operations

```
Render (API)  →  copy URL  →  Vercel (NEXT_PUBLIC_API_URL)  →  copy URL
              →  Render (CORS_ORIGIN)  →  redeploy API
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | API with file watching |
| `npm start` | API, production mode |
| `npm run seed` | Wipe and rebuild demo data (prints credentials) |
| `npm test` | 27 cross-tenant security tests against an in-memory MongoDB |
