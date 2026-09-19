import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { createDataGrantCache, grantDataCategory, loadDataGrantCache } from "./data-grants.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://custos:custos@localhost:5433/custos";
const db = createDb(databaseUrl);

afterAll(async () => {
  await db.$client.end();
});

describe("createDataGrantCache", () => {
  it("denies by default: no grant means not allowed", () => {
    const cache = createDataGrantCache();
    expect(cache.isAllowed("did:web:test:agent-1", "email")).toBe(false);
  });

  it("allows a category once granted, in memory, synchronously", () => {
    const cache = createDataGrantCache();
    cache.grant("did:web:test:agent-1", "email");
    expect(cache.isAllowed("did:web:test:agent-1", "email")).toBe(true);
  });

  it("does not leak a grant across categories or agents", () => {
    const cache = createDataGrantCache();
    cache.grant("did:web:test:agent-1", "email");
    expect(cache.isAllowed("did:web:test:agent-1", "ssn")).toBe(false);
    expect(cache.isAllowed("did:web:test:agent-2", "email")).toBe(false);
  });
});

describe("grantDataCategory + loadDataGrantCache", () => {
  it("persists a grant durably and reloads it into a fresh cache (survives a restart)", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    await grantDataCategory({ db, agentDid, category: "credit-card" });

    const reloaded = await loadDataGrantCache(db);
    expect(reloaded.isAllowed(agentDid, "credit-card")).toBe(true);
    expect(reloaded.isAllowed(agentDid, "ssn")).toBe(false);
  });

  it("is idempotent: granting an already-granted pair does not error", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    await grantDataCategory({ db, agentDid, category: "email" });
    await grantDataCategory({ db, agentDid, category: "email" });

    const reloaded = await loadDataGrantCache(db);
    expect(reloaded.isAllowed(agentDid, "email")).toBe(true);
  });
});
