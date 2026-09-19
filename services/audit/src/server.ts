import { buildDidWebDocument, createLocalKeyProvider, type KeyProvider } from "@custos/core";
import { createLogger } from "@custos/observability";
import Fastify from "fastify";
import { z } from "zod";
import { appendRecord } from "./records/append.js";
import { listRecords } from "./records/list.js";
import type { AuditDb } from "./db/client.js";

// Re-exported so other packages' e2e tests can boot a real instance of this
// service in-process, matching services/{identity,vault,revocation}/src/server.ts.
export { createDb } from "./db/client.js";

const appendSchema = z.object({
  agentDid: z.string().min(1),
  tool: z.string().min(1),
  action: z.string().min(1),
  dataCategories: z.array(z.string()),
  policy: z.object({ rule: z.string().min(1), decision: z.enum(["allow", "deny"]) }),
  reason: z.string().optional(),
  detectedCategories: z.array(z.string()).optional(),
  redactedCategories: z.array(z.string()).optional(),
  recordedAt: z.string().min(1),
});

/**
 * The append-only audit trail: `POST /records` validates and stores one
 * action outcome's unsigned fields; `GET /records` signs every matching row
 * fresh, under whichever key is live right now (ADR 0006), and independent
 * verification resolves the key from `/.well-known/did.json`, the same
 * `KeyProvider`-backed did:web identity every other service publishes.
 */
export async function buildServer(options: {
  readonly db: AuditDb;
  readonly didDomain?: string;
  readonly keyProvider?: KeyProvider;
}): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ loggerInstance: createLogger({ level: "silent" }) });
  const { db } = options;
  const keyProvider = options.keyProvider ?? createLocalKeyProvider();
  const domain = options.didDomain ?? "localhost:4004";

  const { keyId, publicKey } = await keyProvider.createKeyPair();
  const didDocument = buildDidWebDocument({ domain, publicKey });
  const signer = { sign: (data: Uint8Array) => keyProvider.sign(keyId, data) };

  app.get("/health", async () => ({ status: "ok", service: "audit" }));

  // The key every puller (custos audit-log, the dashboard) verifies against.
  app.get("/.well-known/did.json", async () => didDocument);

  // Called by the vault, fire-and-forget — nothing consumes a response body
  // beyond `response.ok` (see services/vault/src/audit/report.ts).
  app.post("/records", async (request, reply) => {
    const body = appendSchema.safeParse(request.body);
    if (!body.success) {
      reply.code(400);
      return { error: "INVALID_INPUT" };
    }
    await appendRecord({ db, record: body.data });
    reply.code(201);
    return { status: "recorded" };
  });

  app.get("/records", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const agentId = typeof query.agentId === "string" ? query.agentId : undefined;

    const result = await listRecords({ db, agentDid: agentId, signer });
    // Polled directly from the browser by apps/dashboard, a different origin
    // — safe to open up because every record is independently verifiable
    // regardless of who fetched it.
    reply.header("access-control-allow-origin", "*");
    if (!result.ok) {
      reply.code(502);
      return { error: result.error };
    }
    return { records: result.value };
  });

  return app;
}
