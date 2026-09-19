import { randomUUID } from "node:crypto";
import { verifyAuditRecord, type DidWebDocument } from "@custos/core";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./db/client.js";
import { buildServer } from "./server.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://custos:custos@localhost:5433/custos";
const db = createDb(databaseUrl);

afterAll(async () => {
  await db.$client.end();
});

/** Same hand-rolled base58 decode used by apps/cli's audit-log command. */
function decodeBase58(input: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes: number[] = [];
  for (const char of input) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) throw new Error(`invalid base58 character: ${char}`);
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function publicKeyFrom(didDocument: DidWebDocument): Uint8Array {
  const multibase = didDocument.verificationMethod[0].publicKeyMultibase;
  return decodeBase58(multibase.slice(1)).slice(2);
}

describe("audit service", () => {
  it("responds to /health", async () => {
    const app = await buildServer({ db });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "audit" });
  });

  it("serves its own did:web document", async () => {
    const app = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    const response = await app.inject({ method: "GET", url: "/.well-known/did.json" });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe("did:web:127.0.0.1%3A4004");
  });

  it("400s a malformed /records post", async () => {
    const app = await buildServer({ db });
    const response = await app.inject({ method: "POST", url: "/records", payload: { tool: "x" } });
    expect(response.statusCode).toBe(400);
  });

  it("502s GET /records when the KMS is unreachable at signing time", async () => {
    const agentDid = `did:web:localhost%3A4001:agents:${randomUUID()}`;
    // A stored record exists, so the failure below is genuinely at read-time
    // signing, not an empty result set.
    const writer = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    await writer.inject({
      method: "POST",
      url: "/records",
      payload: {
        agentDid,
        tool: "mock-slack",
        action: "post-message",
        dataCategories: [],
        policy: { rule: "allowlist", decision: "allow" },
        recordedAt: "2026-09-12T10:00:00.000Z",
      },
    });

    const failingKeyProvider = {
      createKeyPair: async () => ({ keyId: "irrelevant", publicKey: new Uint8Array(32) }),
      sign: () => Promise.reject(new Error("KMS unreachable")),
    };
    const app = await buildServer({
      db,
      didDomain: "127.0.0.1:4004",
      keyProvider: failingKeyProvider,
    });

    const response = await app.inject({
      method: "GET",
      url: `/records?agentId=${encodeURIComponent(agentDid)}`,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("SIGNING_FAILED");
  });

  it("stores a record and returns it signed and independently verifiable", async () => {
    const app = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    const didResponse = await app.inject({ method: "GET", url: "/.well-known/did.json" });
    const publicKey = publicKeyFrom(didResponse.json() as DidWebDocument);
    const agentDid = `did:web:localhost%3A4001:agents:${randomUUID()}`;

    const posted = await app.inject({
      method: "POST",
      url: "/records",
      payload: {
        agentDid,
        tool: "mock-slack",
        action: "post-message",
        dataCategories: ["messaging-content"],
        policy: { rule: "allowlist", decision: "allow" },
        recordedAt: "2026-09-12T10:00:00.000Z",
      },
    });
    expect(posted.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: `/records?agentId=${encodeURIComponent(agentDid)}`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers["access-control-allow-origin"]).toBe("*");
    const { records } = listed.json() as { records: readonly string[] };
    expect(records).toHaveLength(1);

    const verified = verifyAuditRecord({ record: records[0]!, publicKey });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.agentDid).toBe(agentDid);
      expect(verified.value.authorityChain).toEqual([agentDid]);
      expect(verified.value.policy).toEqual({ rule: "allowlist", decision: "allow" });
    }
  });

  it("only returns records for the requested agent when ?agentId is set", async () => {
    const app = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    const agentA = `did:web:localhost%3A4001:agents:${randomUUID()}`;
    const agentB = `did:web:localhost%3A4001:agents:${randomUUID()}`;

    for (const agentDid of [agentA, agentB]) {
      await app.inject({
        method: "POST",
        url: "/records",
        payload: {
          agentDid,
          tool: "mock-slack",
          action: "post-message",
          dataCategories: [],
          policy: { rule: "allowlist", decision: "allow" },
          recordedAt: "2026-09-12T10:00:00.000Z",
        },
      });
    }

    const listed = await app.inject({
      method: "GET",
      url: `/records?agentId=${encodeURIComponent(agentA)}`,
    });
    const { records } = listed.json() as { records: readonly string[] };
    expect(records).toHaveLength(1);
  });

  // The genuine bug found by manually smoke-testing the real built services
  // (docs/progress.md, 2026-09-12): a record signed once at write time and
  // stored as-is would permanently fail to verify after any restart, since
  // this service's signing key is ephemeral like every other service's own.
  // Read-time signing (ADR 0006) means a restart must not orphan history.
  it("still verifies a pre-existing record after a simulated restart with a new signing key", async () => {
    const agentDid = `did:web:localhost%3A4001:agents:${randomUUID()}`;
    const firstProcess = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    await firstProcess.inject({
      method: "POST",
      url: "/records",
      payload: {
        agentDid,
        tool: "stripe",
        action: "list-customers",
        dataCategories: ["payment-customer-data"],
        policy: { rule: "allowlist", decision: "deny" },
        reason: 'no grant for tool "stripe"',
        recordedAt: "2026-09-12T10:00:00.000Z",
      },
    });

    // A brand-new process: a fresh in-memory KeyProvider means a genuinely
    // different signing key, exactly like a real restart.
    const secondProcess = await buildServer({ db, didDomain: "127.0.0.1:4004" });
    const didResponse = await secondProcess.inject({ method: "GET", url: "/.well-known/did.json" });
    const publicKey = publicKeyFrom(didResponse.json() as DidWebDocument);

    const listed = await secondProcess.inject({
      method: "GET",
      url: `/records?agentId=${encodeURIComponent(agentDid)}`,
    });
    const { records } = listed.json() as { records: readonly string[] };
    expect(records).toHaveLength(1);

    const verified = verifyAuditRecord({ record: records[0]!, publicKey });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.value.reason).toBe('no grant for tool "stripe"');
  });
});
