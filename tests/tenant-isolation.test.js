import request from "supertest";
import { createApp } from "../src/app.js";
import { seed } from "../src/seed/seed.js";
import { auth, login, startTestDb, stopTestDb } from "./helpers.js";

/**
 * The acceptance tests from section 14 of the brief, automated.
 *
 * Two seeded organizations (Acme, Globex) with separate users and records. Every
 * test below tries to reach across that boundary and asserts that it fails.
 */

let app;
let acmeAdmin, acmeSales, globexAdmin;
let acmeLeadId, acmeCustomerId, acmeActivityId;
let globexLeadId;

beforeAll(async () => {
  await startTestDb();
  await seed({ verbose: false });
  app = createApp();

  acmeAdmin = await login(app, "admin@acme.com", "Admin@123");
  acmeSales = await login(app, "sales@acme.com", "Sales@123");
  globexAdmin = await login(app, "admin@globex.com", "Admin@123");

  const acmeLeads = await request(app).get("/api/leads?limit=5").set(auth(acmeAdmin.token));
  acmeLeadId = acmeLeads.body.data[0]._id;

  const globexLeads = await request(app).get("/api/leads?limit=5").set(auth(globexAdmin.token));
  globexLeadId = globexLeads.body.data[0]._id;

  const acmeCustomers = await request(app).get("/api/customers?limit=5").set(auth(acmeAdmin.token));
  acmeCustomerId = acmeCustomers.body.data[0]._id;

  const acmeActivities = await request(app).get(`/api/activities/${acmeLeadId}`).set(auth(acmeAdmin.token));
  acmeActivityId = acmeActivities.body.data[0]?._id;
});

afterAll(async () => {
  await stopTestDb();
});

describe("Authentication (401)", () => {
  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed token", async () => {
    const res = await request(app).get("/api/leads").set(auth("not-a-real-token"));
    expect(res.status).toBe(401);
  });

  it("rejects wrong credentials without revealing which part was wrong", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@acme.com", password: "WrongPassword1" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("never returns the password hash on login", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@acme.com", password: "Admin@123" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe("Tenant isolation — list scoping", () => {
  it("shows each tenant only its own leads", async () => {
    const acme = await request(app).get("/api/leads?limit=100").set(auth(acmeAdmin.token));
    const globex = await request(app).get("/api/leads?limit=100").set(auth(globexAdmin.token));

    expect(acme.status).toBe(200);
    expect(globex.status).toBe(200);
    expect(acme.body.data.length).toBeGreaterThan(0);
    expect(globex.body.data.length).toBeGreaterThan(0);

    const acmeIds = new Set(acme.body.data.map((l) => l._id));
    const overlap = globex.body.data.filter((l) => acmeIds.has(l._id));
    expect(overlap).toHaveLength(0);
  });

  it("shows each tenant only its own customers", async () => {
    const acme = await request(app).get("/api/customers?limit=100").set(auth(acmeAdmin.token));
    const globex = await request(app).get("/api/customers?limit=100").set(auth(globexAdmin.token));

    const acmeIds = new Set(acme.body.data.map((c) => c._id));
    expect(globex.body.data.filter((c) => acmeIds.has(c._id))).toHaveLength(0);
  });

  it("shows each tenant only its own users", async () => {
    const res = await request(app).get("/api/users").set(auth(globexAdmin.token));
    expect(res.status).toBe(200);
    const emails = res.body.data.map((u) => u.email);
    expect(emails.every((e) => e.endsWith("@globex.com"))).toBe(true);
  });
});

describe("Tenant isolation — cross-tenant record access (404, never 403)", () => {
  it("GET another tenant's lead by id returns 404", async () => {
    const res = await request(app).get(`/api/leads/${acmeLeadId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("PUT another tenant's lead returns 404 and does not modify it", async () => {
    const res = await request(app)
      .put(`/api/leads/${acmeLeadId}`)
      .set(auth(globexAdmin.token))
      .send({ name: "Hijacked By Globex" });
    expect(res.status).toBe(404);

    const check = await request(app).get(`/api/leads/${acmeLeadId}`).set(auth(acmeAdmin.token));
    expect(check.status).toBe(200);
    expect(check.body.data.name).not.toBe("Hijacked By Globex");
  });

  it("DELETE another tenant's lead returns 404 and leaves it intact", async () => {
    const res = await request(app).delete(`/api/leads/${acmeLeadId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);

    const check = await request(app).get(`/api/leads/${acmeLeadId}`).set(auth(acmeAdmin.token));
    expect(check.status).toBe(200);
  });

  it("GET another tenant's customer returns 404", async () => {
    const res = await request(app).get(`/api/customers/${acmeCustomerId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);
  });

  it("DELETE another tenant's customer returns 404", async () => {
    const res = await request(app).delete(`/api/customers/${acmeCustomerId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);
  });

  it("GET activities of another tenant's lead returns 404", async () => {
    const res = await request(app).get(`/api/activities/${acmeLeadId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);
  });

  it("POST an activity onto another tenant's lead returns 404", async () => {
    const res = await request(app)
      .post("/api/activities")
      .set(auth(globexAdmin.token))
      .send({ type: "CALL", title: "Cross-tenant probe", leadId: acmeLeadId });
    expect(res.status).toBe(404);
  });

  it("DELETE another tenant's activity returns 404", async () => {
    if (!acmeActivityId) return;
    const res = await request(app).delete(`/api/activities/${acmeActivityId}`).set(auth(globexAdmin.token));
    expect(res.status).toBe(404);
  });

  it("converting another tenant's lead returns 404", async () => {
    const res = await request(app).post(`/api/leads/${acmeLeadId}/convert`).set(auth(globexAdmin.token)).send({});
    expect(res.status).toBe(404);
  });
});

describe("Tenant isolation — client-supplied tenantId is ignored", () => {
  it("creating a lead with another tenant's id still writes into the caller's tenant", async () => {
    const res = await request(app)
      .post("/api/leads")
      .set(auth(globexAdmin.token))
      .send({
        name: "Injected Lead",
        email: "injected@example.com",
        phone: "+91 9876543210",
        company: "Injection Test Ltd",
        tenantId: acmeAdmin.tenant.id, // ← attacker-supplied, must be discarded
      });

    expect(res.status).toBe(201);
    expect(String(res.body.data.tenantId)).toBe(String(globexAdmin.tenant.id));

    // And it must not be visible to Acme.
    const acmeView = await request(app)
      .get(`/api/leads?search=injected@example.com`)
      .set(auth(acmeAdmin.token));
    expect(acmeView.body.data).toHaveLength(0);
  });

  it("updating a lead cannot move it to another tenant", async () => {
    const res = await request(app)
      .put(`/api/leads/${globexLeadId}`)
      .set(auth(globexAdmin.token))
      .send({ name: "Renamed", tenantId: acmeAdmin.tenant.id });

    expect(res.status).toBe(200);
    expect(String(res.body.data.tenantId)).toBe(String(globexAdmin.tenant.id));
  });

  it("cannot assign a lead to a user from another tenant", async () => {
    const acmeUsers = await request(app).get("/api/users").set(auth(acmeAdmin.token));
    const acmeUserId = acmeUsers.body.data[0]._id;

    const res = await request(app)
      .post("/api/leads")
      .set(auth(globexAdmin.token))
      .send({
        name: "Cross Assign",
        email: "crossassign@example.com",
        phone: "+91 9876500000",
        company: "Cross Assign Ltd",
        assignedTo: acmeUserId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/does not belong to your organization/i);
  });
});

describe("Role-based authorization (403)", () => {
  it("SALES cannot delete a lead", async () => {
    const res = await request(app).delete(`/api/leads/${acmeLeadId}`).set(auth(acmeSales.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("SALES cannot delete a customer", async () => {
    const res = await request(app).delete(`/api/customers/${acmeCustomerId}`).set(auth(acmeSales.token));
    expect(res.status).toBe(403);
  });

  it("SALES cannot create users", async () => {
    const res = await request(app)
      .post("/api/auth/users")
      .set(auth(acmeSales.token))
      .send({ name: "X", email: "x@acme.com", password: "Password@1" });
    expect(res.status).toBe(403);
  });

  it("SALES CAN read, create and update leads", async () => {
    const read = await request(app).get("/api/leads").set(auth(acmeSales.token));
    expect(read.status).toBe(200);

    const create = await request(app).post("/api/leads").set(auth(acmeSales.token)).send({
      name: "Sales Created Lead",
      email: "salescreated@example.com",
      phone: "+91 9811111111",
      company: "Sales Test Ltd",
    });
    expect(create.status).toBe(201);

    const update = await request(app)
      .put(`/api/leads/${create.body.data._id}`)
      .set(auth(acmeSales.token))
      .send({ status: "CONTACTED" });
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe("CONTACTED");
  });

  it("ADMIN can delete a lead", async () => {
    const create = await request(app).post("/api/leads").set(auth(acmeAdmin.token)).send({
      name: "Disposable Lead",
      email: "disposable@example.com",
      phone: "+91 9822222222",
      company: "Disposable Ltd",
    });
    const res = await request(app).delete(`/api/leads/${create.body.data._id}`).set(auth(acmeAdmin.token));
    expect(res.status).toBe(204);
  });
});

describe("Token audience separation", () => {
  it("a tenant token cannot access platform routes", async () => {
    const res = await request(app).get("/api/platform/tenants").set(auth(acmeAdmin.token));
    expect(res.status).toBe(401);
  });

  it("a platform token cannot access tenant CRM routes", async () => {
    const platform = await request(app)
      .post("/api/auth/platform/login")
      .send({ email: "superadmin@morshcrm.com", password: "SuperAdmin@123" });
    expect(platform.status).toBe(200);

    const res = await request(app).get("/api/leads").set(auth(platform.body.data.token));
    expect(res.status).toBe(401);
  });
});

describe("Reporting is tenant-scoped", () => {
  it("dashboard numbers never include another tenant's records", async () => {
    const acme = await request(app).get("/api/reports/dashboard").set(auth(acmeAdmin.token));
    const globex = await request(app).get("/api/reports/dashboard").set(auth(globexAdmin.token));

    expect(acme.status).toBe(200);
    expect(globex.status).toBe(200);

    const acmeLeadList = await request(app).get("/api/leads?limit=100").set(auth(acmeAdmin.token));
    expect(acme.body.data.kpis.totalLeads).toBe(acmeLeadList.body.meta.total);

    const acmeIds = new Set(acme.body.data.recentLeads.map((l) => l._id));
    expect(globex.body.data.recentLeads.filter((l) => acmeIds.has(l._id))).toHaveLength(0);
  });
});
