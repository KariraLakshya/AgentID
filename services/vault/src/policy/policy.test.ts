import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client.js";
import { grantToolAccess, isToolAllowed } from "./policy.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://custos:custos@localhost:5433/custos";
const db = createDb(databaseUrl);

afterAll(async () => {
  await db.$client.end();
});

describe("grantToolAccess / isToolAllowed", () => {
  it("denies by default: no grant row means no access", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    expect(await isToolAllowed(db, agentDid, "mock-slack")).toBe(false);
  });

  it("allows a tool once it has been granted", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    await grantToolAccess({ db, agentDid, tool: "mock-slack" });

    expect(await isToolAllowed(db, agentDid, "mock-slack")).toBe(true);
  });

  it("does not allow a tool that was never granted, even for an agent with a different grant", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    await grantToolAccess({ db, agentDid, tool: "mock-slack" });

    expect(await isToolAllowed(db, agentDid, "stripe")).toBe(false);
  });

  it("does not leak a grant across agents", async () => {
    const grantedAgent = `did:web:test:agent-${randomUUID()}`;
    const otherAgent = `did:web:test:agent-${randomUUID()}`;
    await grantToolAccess({ db, agentDid: grantedAgent, tool: "mock-database" });

    expect(await isToolAllowed(db, otherAgent, "mock-database")).toBe(false);
  });

  it("is idempotent: granting an already-granted pair does not error", async () => {
    const agentDid = `did:web:test:agent-${randomUUID()}`;
    await grantToolAccess({ db, agentDid, tool: "stripe" });
    await grantToolAccess({ db, agentDid, tool: "stripe" });

    expect(await isToolAllowed(db, agentDid, "stripe")).toBe(true);
  });
});
