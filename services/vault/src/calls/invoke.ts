import { PII_CATEGORIES, scanAndRedact, verifyScopedToken, type SecretCipher } from "@custos/core";
import { err, type Result } from "@custos/contracts";
import type { Connector, ConnectorCallError } from "@custos/connectors";
import { loadToolCredential } from "../credentials/store.js";
import { createNoopAuditReporter, type AuditReporter } from "../audit/report.js";
import type { DataGrantCache } from "../policy/data-grants.js";
import type { VaultDb } from "../db/client.js";

function connectorErrorReason(error: ConnectorCallError): string {
  if (error.code === "UPSTREAM_ERROR") return error.reason;
  if (error.code === "INVALID_INPUT") return error.reason;
  if (error.code === "UNKNOWN_ACTION") return `unknown action: ${error.action}`;
  return `agent revoked at the connector: ${error.agentId}`;
}

export type InvokeToolError =
  | { readonly code: "INVALID_TOKEN"; readonly reason: string }
  | { readonly code: "ACTION_MISMATCH" }
  | { readonly code: "AGENT_REVOKED"; readonly agentId: string }
  | { readonly code: "REVOCATION_STATE_STALE"; readonly reason: string }
  | { readonly code: "UNKNOWN_TOOL"; readonly tool: string }
  | ConnectorCallError;

/** The hot path's local revocation view — no database, no network. */
export interface RevocationGate {
  isRevoked(agentDid: string): boolean;
  isStale(now: Date): boolean;
}

/**
 * Redeems a scoped token for one tool call. Token verification and the
 * revocation check are both entirely local (CLAUDE.md section 3, hot path) —
 * no DB or network access happens until after both have already checked out.
 * The decrypted credential lives only in this function's stack for the
 * duration of the call and is never logged (CLAUDE.md section 4).
 *
 * Revocation is checked on every call rather than only at token issuance:
 * a token is valid for 60 seconds, and the whole point of Phase 3 is that a
 * revoked agent stops working in about one second, not up to sixty.
 */
export async function invokeTool(params: {
  readonly db: VaultDb;
  readonly cipher: SecretCipher;
  readonly connectors: ReadonlyMap<string, Connector>;
  readonly token: string;
  readonly vaultPublicKey: Uint8Array;
  readonly action: string;
  readonly input: unknown;
  readonly now: Date;
  readonly revocation: RevocationGate;
  readonly audit?: AuditReporter;
  readonly dataGrants?: DataGrantCache;
}): Promise<Result<unknown, InvokeToolError>> {
  const {
    db,
    cipher,
    connectors,
    token,
    vaultPublicKey,
    action,
    input,
    now,
    revocation,
    audit = createNoopAuditReporter(),
    dataGrants,
  } = params;

  const verified = verifyScopedToken({ token, publicKey: vaultPublicKey, now });
  if (!verified.ok) {
    // Never audited: an unverified claimant isn't attributable to an agent
    // (ADR 0006).
    return err({ code: "INVALID_TOKEN", reason: verified.error.code });
  }
  const claims = verified.value;
  const dataCategories = connectors.get(claims.tool)?.dataCategories ?? [];
  const report = (outcome: {
    rule: string;
    decision: "allow" | "deny";
    reason?: string;
    detectedCategories?: readonly string[];
    redactedCategories?: readonly string[];
  }): void =>
    audit.report({
      agentDid: claims.sub,
      tool: claims.tool,
      action,
      dataCategories,
      policy: { rule: outcome.rule, decision: outcome.decision },
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(outcome.detectedCategories === undefined
        ? {}
        : { detectedCategories: outcome.detectedCategories }),
      ...(outcome.redactedCategories === undefined
        ? {}
        : { redactedCategories: outcome.redactedCategories }),
      now,
    });

  if (claims.action !== action) {
    report({ rule: "token-scope", decision: "deny", reason: "action outside the token's scope" });
    return err({ code: "ACTION_MISMATCH" });
  }

  if (revocation.isRevoked(claims.sub)) {
    report({ rule: "revocation", decision: "deny", reason: "agent is revoked" });
    return err({ code: "AGENT_REVOKED", agentId: claims.sub });
  }
  // Fail closed on bounded staleness: if the local view is too old to trust,
  // deny rather than serve an allow decision from a stale cache. Reported
  // under the same "revocation" rule as an actual revocation deny — from the
  // caller's side both look identical (access refused), and the underlying
  // cause is recorded in `reason`.
  if (revocation.isStale(now)) {
    report({
      rule: "revocation",
      decision: "deny",
      reason: "local revocation state is older than the configured bound",
    });
    return err({
      code: "REVOCATION_STATE_STALE",
      reason: "local revocation state is older than the configured bound",
    });
  }

  const connector = connectors.get(claims.tool);
  if (!connector) {
    report({
      rule: "connector",
      decision: "deny",
      reason: "no connector configured for this tool",
    });
    return err({ code: "UNKNOWN_TOOL", tool: claims.tool });
  }

  const credential = await loadToolCredential({ db, cipher, tool: claims.tool });
  if (credential === null) {
    report({ rule: "connector", decision: "deny", reason: "no credential stored for this tool" });
    return err({ code: "UNKNOWN_TOOL", tool: claims.tool });
  }

  const result = await connector.call({ action, input, credential, agentId: claims.sub });
  if (!result.ok) {
    report({ rule: "connector", decision: "deny", reason: connectorErrorReason(result.error) });
    return result;
  }

  // Live pattern scan (packages/core/src/pii/detect.ts) over the actual
  // response — distinct from, and layered on top of, the connector's own
  // static `dataCategories` declaration. Masks any PII category this agent
  // holds no data grant for; the audit record names exactly what was found
  // and what was withheld, on the same "allow" event as the call itself.
  const allowedCategories = new Set(
    PII_CATEGORIES.filter((category) => dataGrants?.isAllowed(claims.sub, category) ?? false),
  );
  const { output, detected, redacted } = scanAndRedact({
    value: result.value,
    allowedCategories,
  });
  report({
    rule: "allowlist",
    decision: "allow",
    ...(redacted.length > 0 ? { reason: `masked PII categories: ${redacted.join(", ")}` } : {}),
    detectedCategories: detected,
    redactedCategories: redacted,
  });
  return { ok: true, value: output };
}
