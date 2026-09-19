import { describe, expect, it } from "vitest";
import { generateKeyPair, sign } from "../crypto/ed25519.js";
import { issueAuditRecord, verifyAuditRecord, type AuditRecord } from "./record.js";

const AGENT_DID = "did:web:localhost%3A4001:agents:0f8f6a1e-9c2b-4a3d-8f1e-1b2c3d4e5f60";

function signerFor(secretKey: Uint8Array) {
  return { sign: async (data: Uint8Array) => sign(data, secretKey) };
}

function recordFor(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    agentDid: AGENT_DID,
    authorityChain: [AGENT_DID],
    tool: "mock-slack",
    action: "post-message",
    dataCategories: ["messaging-content"],
    policy: { rule: "allowlist", decision: "allow" },
    recordedAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
  };
}

describe("issueAuditRecord", () => {
  it("produces a two-part compact envelope", async () => {
    const { secretKey } = generateKeyPair();
    const issued = await issueAuditRecord({ record: recordFor(), signer: signerFor(secretKey) });
    expect(issued.ok).toBe(true);
    if (issued.ok) expect(issued.value.split(".")).toHaveLength(2);
  });

  it("fails closed when the signer throws rather than propagating", async () => {
    const issued = await issueAuditRecord({
      record: recordFor(),
      signer: {
        sign: async () => {
          throw new Error("KMS unavailable");
        },
      },
    });
    expect(issued.ok).toBe(false);
    if (!issued.ok) {
      expect(issued.error.code).toBe("SIGNING_FAILED");
      expect(issued.error.reason).toContain("KMS unavailable");
    }
  });
});

describe("verifyAuditRecord", () => {
  it("verifies a record and returns its claims", async () => {
    const { publicKey, secretKey } = generateKeyPair();
    const record = recordFor({ reason: "no grant for tool" });
    const issued = await issueAuditRecord({ record, signer: signerFor(secretKey) });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const verified = verifyAuditRecord({ record: issued.value, publicKey });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.value).toEqual(record);
  });

  it("verifies a deny record with no reason given", async () => {
    const { publicKey, secretKey } = generateKeyPair();
    const record = recordFor({ policy: { rule: "revocation", decision: "deny" } });
    const issued = await issueAuditRecord({ record, signer: signerFor(secretKey) });
    if (!issued.ok) throw new Error("expected issuance to succeed");
    const verified = verifyAuditRecord({ record: issued.value, publicKey });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.value.reason).toBeUndefined();
  });

  // A record documents history; re-verifying it later (e.g. after the
  // signing key has been rotated and this row re-signed) must keep working.
  it("keeps verifying on replay — a record never expires", async () => {
    const { publicKey, secretKey } = generateKeyPair();
    const issued = await issueAuditRecord({ record: recordFor(), signer: signerFor(secretKey) });
    if (!issued.ok) throw new Error("expected issuance to succeed");
    expect(verifyAuditRecord({ record: issued.value, publicKey }).ok).toBe(true);
    expect(verifyAuditRecord({ record: issued.value, publicKey }).ok).toBe(true);
  });

  it("rejects a record whose claims were tampered with after signing", async () => {
    const { publicKey, secretKey } = generateKeyPair();
    const issued = await issueAuditRecord({ record: recordFor(), signer: signerFor(secretKey) });
    if (!issued.ok) throw new Error("expected issuance to succeed");

    const [, signature] = issued.value.split(".") as [string, string];
    const swapped = Buffer.from(
      JSON.stringify(
        recordFor({ policy: { rule: "allowlist", decision: "allow" }, tool: "stripe" }),
      ),
      "utf8",
    ).toString("base64url");
    const result = verifyAuditRecord({ record: `${swapped}.${signature}`, publicKey });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNATURE_INVALID");
  });

  it("rejects a record signed by an unknown key", async () => {
    const { secretKey } = generateKeyPair();
    const impostor = generateKeyPair();
    const issued = await issueAuditRecord({ record: recordFor(), signer: signerFor(secretKey) });
    if (!issued.ok) throw new Error("expected issuance to succeed");

    const result = verifyAuditRecord({ record: issued.value, publicKey: impostor.publicKey });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNATURE_INVALID");
  });

  it.each([
    ["no separator", "not-a-record"],
    ["too many separators", "a.b.c"],
    ["empty string", ""],
  ])("rejects a malformed envelope (%s)", (_label, record) => {
    const { publicKey } = generateKeyPair();
    const result = verifyAuditRecord({ record, publicKey });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MALFORMED_RECORD");
  });

  it.each([
    ["missing agentDid", { ...recordFor(), agentDid: undefined }],
    ["empty authorityChain", { ...recordFor(), authorityChain: [] }],
    ["missing tool", { ...recordFor(), tool: undefined }],
    ["missing policy.rule", { ...recordFor(), policy: { decision: "allow" } }],
    [
      "invalid policy.decision",
      { ...recordFor(), policy: { rule: "allowlist", decision: "maybe" } },
    ],
    ["non-string dataCategories entry", { ...recordFor(), dataCategories: [1] }],
    ["null claims", null],
    ["array claims", []],
  ])("rejects correctly signed but structurally invalid claims (%s)", async (_label, claims) => {
    const { publicKey, secretKey } = generateKeyPair();
    const encodedClaims = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = sign(Buffer.from(encodedClaims, "utf8"), secretKey);
    const record = `${encodedClaims}.${Buffer.from(signature).toString("base64url")}`;
    const result = verifyAuditRecord({ record, publicKey });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MALFORMED_RECORD");
  });
});
