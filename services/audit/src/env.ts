import { baseEnvSchema, loadEnv } from "@custos/config";
import { z } from "zod";

export const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(4004),
  DATABASE_URL: z.string().min(1).default("postgres://custos:custos@localhost:5433/custos"),
  // Domain this service's own did:web document is published under. It signs
  // every audit record fresh at read time, so a puller resolves this DID to
  // get the key they verify against.
  AUDIT_DID_DOMAIN: z.string().min(1).default("localhost:4004"),
});

export type Env = z.infer<typeof envSchema>;

export function loadAuditEnv(source?: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, source);
}
