import { auditRecords } from "../db/schema.js";
import type { AuditDb } from "../db/client.js";

export interface AppendableRecord {
  readonly agentDid: string;
  readonly tool: string;
  readonly action: string;
  readonly dataCategories: readonly string[];
  readonly policy: { readonly rule: string; readonly decision: "allow" | "deny" };
  readonly reason?: string;
  readonly detectedCategories?: readonly string[];
  readonly redactedCategories?: readonly string[];
  readonly recordedAt: string;
}

/**
 * Validates and stores one action outcome's unsigned fields. Nothing
 * consumes a signed response here — the vault's `AuditReporter` only checks
 * `response.ok` — so there is nothing to return.
 */
export async function appendRecord(params: {
  readonly db: AuditDb;
  readonly record: AppendableRecord;
}): Promise<void> {
  const { db, record } = params;
  await db.insert(auditRecords).values({
    agentDid: record.agentDid,
    tool: record.tool,
    action: record.action,
    dataCategories: record.dataCategories,
    policyRule: record.policy.rule,
    decision: record.policy.decision,
    reason: record.reason ?? null,
    detectedCategories: record.detectedCategories ?? null,
    redactedCategories: record.redactedCategories ?? null,
    recordedAt: new Date(record.recordedAt),
  });
}
