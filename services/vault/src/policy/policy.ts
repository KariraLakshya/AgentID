import { and, eq } from "drizzle-orm";
import { agentPolicies } from "../db/schema.js";
import type { VaultDb } from "../db/client.js";

export interface GrantedPolicy {
  readonly agentDid: string;
  readonly tool: string;
}

/**
 * Grants `agentDid` access to `tool` — a Phase 4 "simple allowlist" (build
 * plan), not full OPA/Rego. Idempotent: granting an already-granted pair
 * keeps the original `createdAt` rather than erroring.
 */
export async function grantToolAccess(params: {
  readonly db: VaultDb;
  readonly agentDid: string;
  readonly tool: string;
}): Promise<GrantedPolicy> {
  const { db, agentDid, tool } = params;
  await db.insert(agentPolicies).values({ agentDid, tool }).onConflictDoNothing();
  return { agentDid, tool };
}

/**
 * Deny by default: no grant row means no access. Enforced once, at token
 * issuance, after the agent's credential has independently verified — see
 * docs/adr/0006-authorization-and-audit-architecture.md.
 */
export async function isToolAllowed(db: VaultDb, agentDid: string, tool: string): Promise<boolean> {
  const rows = await db
    .select({ tool: agentPolicies.tool })
    .from(agentPolicies)
    .where(and(eq(agentPolicies.agentDid, agentDid), eq(agentPolicies.tool, tool)))
    .limit(1);
  return rows.length > 0;
}
