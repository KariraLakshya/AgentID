import { err, ok } from "@custos/contracts";
import { createRevocationGuard, type Connector } from "./connector.js";

// Deliberately carries real-shaped PII (a genuine-format SSN, a Luhn-valid
// test card number, real-looking emails) so `@custos/core`'s live PII scan
// has something honest to actually find, not a rigged demo fixture.
const FAKE_TABLES: Record<string, readonly Record<string, unknown>[]> = {
  customers: [
    { id: 1, name: "Ada Lovelace", email: "ada@example.com", ssn: "078-05-1120" },
    { id: 2, name: "Alan Turing", email: "alan@example.com", ssn: "219-09-9999" },
  ],
  payments: [
    { id: 1, customerId: 1, cardNumber: "4111111111111111", amount: 4200 },
    { id: 2, customerId: 2, cardNumber: "5500000000000004", amount: 1999 },
  ],
};

function isQueryInput(value: unknown): value is { table: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { table?: unknown }).table === "string"
  );
}

/**
 * Fake internal-database connector: no network calls, canned rows only.
 * Exists to prove the vault/token pattern generalizes across more than one
 * tool (CLAUDE.md's Phase 2 "two or three tool connectors").
 */
export function createMockDatabaseConnector(): Connector {
  const guard = createRevocationGuard();

  return {
    tool: "mock-database",
    dataCategories: ["internal-records"],
    async call({ action, input, agentId }) {
      if (guard.isRevoked(agentId)) {
        return err({ code: "AGENT_REVOKED", agentId });
      }
      if (action !== "query") {
        return err({ code: "UNKNOWN_ACTION", action });
      }
      if (!isQueryInput(input)) {
        return err({ code: "INVALID_INPUT", reason: "expected { table: string }" });
      }
      const rows = FAKE_TABLES[input.table];
      if (!rows) {
        return err({ code: "UPSTREAM_ERROR", reason: `unknown table: ${input.table}` });
      }
      return ok(rows);
    },
    async revoke(agentId) {
      guard.revoke(agentId);
    },
  };
}
