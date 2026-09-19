import { asc, eq } from "drizzle-orm";
import { issueAuditRecord, type AuditRecordSigner } from "@custos/core";
import { err, ok, type Result } from "@custos/contracts";
import { auditRecords } from "../db/schema.js";
import type { AuditDb } from "../db/client.js";

export type ListRecordsError = { readonly code: "SIGNING_FAILED"; readonly reason: string };

/**
 * Every matching record as a freshly signed envelope (ADR 0006): this
 * service's schema stores unsigned fields, and each row is signed under
 * whichever key is live right now, identical in shape to
 * `services/revocation`'s `listTombstones()`. A restart that rotates the
 * signing key never orphans a historical record. Oldest first, matching the
 * order the dashboard and CLI expect.
 */
export async function listRecords(params: {
  readonly db: AuditDb;
  readonly agentDid?: string;
  readonly signer: AuditRecordSigner;
}): Promise<Result<readonly string[], ListRecordsError>> {
  const { db, agentDid, signer } = params;

  const rows = await db
    .select()
    .from(auditRecords)
    .where(agentDid === undefined ? undefined : eq(auditRecords.agentDid, agentDid))
    .orderBy(asc(auditRecords.recordedAt), asc(auditRecords.id));

  const signed: string[] = [];
  for (const row of rows) {
    const issued = await issueAuditRecord({
      record: {
        agentDid: row.agentDid,
        authorityChain: [row.agentDid],
        tool: row.tool,
        action: row.action,
        dataCategories: row.dataCategories,
        policy: { rule: row.policyRule, decision: row.decision as "allow" | "deny" },
        ...(row.reason === null ? {} : { reason: row.reason }),
        recordedAt: row.recordedAt.toISOString(),
      },
      signer,
    });
    if (!issued.ok) {
      return err({ code: "SIGNING_FAILED", reason: issued.error.reason });
    }
    signed.push(issued.value);
  }

  return ok(signed);
}
