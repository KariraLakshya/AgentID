import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Stores the *unsigned* fields of an action outcome, not a pre-signed
 * envelope — `GET /records` signs every row fresh at read time, so a signing
 * key rotation or a process restart never orphans historical records. See
 * docs/adr/0006-authorization-and-audit-architecture.md.
 *
 * `authorityChain` is not a column: it is flat (just `[agentDid]`) until
 * delegation exists, so it is synthesized when a row is read and signed
 * rather than stored redundantly.
 */
export const auditRecords = pgTable("audit_records", {
  id: serial("id").primaryKey(),
  agentDid: text("agent_did").notNull(),
  tool: text("tool").notNull(),
  action: text("action").notNull(),
  dataCategories: jsonb("data_categories").$type<readonly string[]>().notNull(),
  policyRule: text("policy_rule").notNull(),
  decision: text("decision").notNull(),
  reason: text("reason"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditRecordRow = typeof auditRecords.$inferSelect;
export type NewAuditRecordRow = typeof auditRecords.$inferInsert;
