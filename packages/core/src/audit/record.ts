import { verify } from "../crypto/ed25519.js";
import { err, ok, type Result } from "../result.js";

/**
 * One action outcome in the append-only audit trail (CLAUDE.md section 10):
 * who did it, under whose authority, what kind of data the tool touches,
 * which rule decided the outcome, and whether it was allowed or denied.
 *
 * `authorityChain` is flat — just `[agentDid]` — until delegation exists
 * (see docs/adr/0006-authorization-and-audit-architecture.md); the field is
 * included now because retrofitting it into the schema later would be
 * painful, not because anything consumes it yet.
 *
 * Deliberately carries no expiry, the same reasoning as a revocation
 * tombstone: a historical record does not stop being true.
 */
export interface AuditRecord {
  readonly agentDid: string;
  readonly authorityChain: readonly string[];
  readonly tool: string;
  readonly action: string;
  readonly dataCategories: readonly string[];
  readonly policy: { readonly rule: string; readonly decision: "allow" | "deny" };
  readonly reason?: string;
  readonly recordedAt: string;
}

/**
 * KMS-shaped signing callback, identical in shape to `TombstoneSigner` and
 * `ScopedTokenSigner` (CLAUDE.md section 4).
 */
export interface AuditRecordSigner {
  readonly sign: (data: Uint8Array) => Promise<Uint8Array>;
}

export type IssueAuditRecordError = { readonly code: "SIGNING_FAILED"; readonly reason: string };

export type VerifyAuditRecordError =
  | { readonly code: "MALFORMED_RECORD"; readonly reason: string }
  | { readonly code: "SIGNATURE_INVALID" };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAuditRecord(value: unknown): value is AuditRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.agentDid !== "string" || record.agentDid.length === 0) return false;
  if (!isStringArray(record.authorityChain) || record.authorityChain.length === 0) return false;
  if (typeof record.tool !== "string" || record.tool.length === 0) return false;
  if (typeof record.action !== "string" || record.action.length === 0) return false;
  if (!isStringArray(record.dataCategories)) return false;
  if (typeof record.recordedAt !== "string" || record.recordedAt.length === 0) return false;
  if (record.reason !== undefined && typeof record.reason !== "string") return false;

  const policy = record.policy as Record<string, unknown> | undefined;
  if (typeof policy !== "object" || policy === null) return false;
  if (typeof policy.rule !== "string" || policy.rule.length === 0) return false;
  if (policy.decision !== "allow" && policy.decision !== "deny") return false;

  return true;
}

/**
 * Same compact envelope as a scoped token or revocation tombstone —
 * base64url(record JSON) + "." + base64url(signature) — for the reasons in
 * docs/adr/0003-scoped-token-format.md, and so the system has one
 * verification path rather than several.
 */
export async function issueAuditRecord(params: {
  readonly record: AuditRecord;
  readonly signer: AuditRecordSigner;
}): Promise<Result<string, IssueAuditRecordError>> {
  try {
    const encodedRecord = Buffer.from(JSON.stringify(params.record), "utf8").toString("base64url");
    const signature = await params.signer.sign(Buffer.from(encodedRecord, "utf8"));
    const encodedSignature = Buffer.from(signature).toString("base64url");
    return ok(`${encodedRecord}.${encodedSignature}`);
  } catch (error) {
    return err({ code: "SIGNING_FAILED", reason: errorMessage(error) });
  }
}

/**
 * Verifies an audit record entirely locally against a caller-supplied public
 * key — no network call, no database lookup. Fails closed: malformed
 * structure and a bad signature are both rejected, never thrown.
 */
export function verifyAuditRecord(params: {
  readonly record: string;
  readonly publicKey: Uint8Array;
}): Result<AuditRecord, VerifyAuditRecordError> {
  const { record, publicKey } = params;
  const parts = record.split(".");
  if (parts.length !== 2) {
    return err({ code: "MALFORMED_RECORD", reason: "expected exactly one '.' separator" });
  }
  const [encodedRecord, encodedSignature] = parts as [string, string];

  let claims: AuditRecord;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encodedRecord, "base64url").toString("utf8"));
    if (!isAuditRecord(decoded)) {
      return err({ code: "MALFORMED_RECORD", reason: "record missing required fields" });
    }
    claims = decoded;
  } catch (error) {
    return err({ code: "MALFORMED_RECORD", reason: errorMessage(error) });
  }

  const signature = Buffer.from(encodedSignature, "base64url");
  const signedData = Buffer.from(encodedRecord, "utf8");
  if (!verify(signature, signedData, publicKey)) {
    return err({ code: "SIGNATURE_INVALID" });
  }

  return ok(claims);
}
