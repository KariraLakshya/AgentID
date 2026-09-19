import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Ciphertext and nonce are base64-encoded @custos/core SecretCipher output
// (see docs/adr/0004-vault-credential-encryption.md) — the plaintext
// credential is never stored, never logged.
export const toolCredentials = pgTable("tool_credentials", {
  tool: text("tool").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ToolCredentialRow = typeof toolCredentials.$inferSelect;
export type NewToolCredentialRow = typeof toolCredentials.$inferInsert;

/**
 * A Phase 4 "simple allowlist" (build plan): the presence of a row is the
 * grant. Deny by default — no row means no access. Checked once, at token
 * issuance, not on the hot path (`/call`) — see
 * docs/adr/0006-authorization-and-audit-architecture.md.
 */
export const agentPolicies = pgTable(
  "agent_policies",
  {
    agentDid: text("agent_did").notNull(),
    tool: text("tool").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.agentDid, table.tool] })],
);

export type AgentPolicyRow = typeof agentPolicies.$inferSelect;
export type NewAgentPolicyRow = typeof agentPolicies.$inferInsert;

/**
 * Which PII categories (see `@custos/core`'s `PiiCategory`) an agent is
 * allowed to see unmasked, independent of which tool a call goes through.
 * Deny by default, same posture as `agentPolicies`: a category with no row
 * here is redacted wherever a live scan finds it in a tool's response.
 */
export const agentDataGrants = pgTable(
  "agent_data_grants",
  {
    agentDid: text("agent_did").notNull(),
    category: text("category").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.agentDid, table.category] })],
);

export type AgentDataGrantRow = typeof agentDataGrants.$inferSelect;
export type NewAgentDataGrantRow = typeof agentDataGrants.$inferInsert;
