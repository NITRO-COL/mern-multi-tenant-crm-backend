import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

let memoryServer;

export async function startTestDb() {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri("morsh_crm_test"));
  return mongoose.connection;
}

export async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await memoryServer?.stop();
}

/** Log in and return the bearer token plus the resolved user/tenant. */
export async function login(app, email, password, tenantSlug) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password, ...(tenantSlug ? { tenantSlug } : {}) });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.token, user: res.body.data.user, tenant: res.body.data.tenant };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
