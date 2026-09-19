import { agentDataGrants } from "../db/schema.js";
import type { VaultDb } from "../db/client.js";

export interface GrantedDataCategory {
  readonly agentDid: string;
  readonly category: string;
}

/**
 * The hot path's local view of which PII categories each agent may see
 * unmasked (CLAUDE.md section 3: no DB call on the hot path). Unlike
 * revocation, grants originate in this same process — there is no other
 * service pushing changes in — so a synchronous in-memory update on grant is
 * sufficient; `loadDataGrantCache` seeds it from Postgres once, at boot, so
 * a restart doesn't silently forget prior grants.
 */
export interface DataGrantCache {
  isAllowed(agentDid: string, category: string): boolean;
  grant(agentDid: string, category: string): void;
}

export function createDataGrantCache(): DataGrantCache {
  const grants = new Map<string, Set<string>>();
  return {
    isAllowed: (agentDid, category) => grants.get(agentDid)?.has(category) ?? false,
    grant: (agentDid, category) => {
      const existing = grants.get(agentDid);
      if (existing) {
        existing.add(category);
      } else {
        grants.set(agentDid, new Set([category]));
      }
    },
  };
}

export async function loadDataGrantCache(db: VaultDb): Promise<DataGrantCache> {
  const cache = createDataGrantCache();
  const rows = await db.select().from(agentDataGrants);
  for (const row of rows) cache.grant(row.agentDid, row.category);
  return cache;
}

/** Persists a grant durably. Idempotent — re-granting an already-held category is a no-op. */
export async function grantDataCategory(params: {
  readonly db: VaultDb;
  readonly agentDid: string;
  readonly category: string;
}): Promise<GrantedDataCategory> {
  const { db, agentDid, category } = params;
  await db.insert(agentDataGrants).values({ agentDid, category }).onConflictDoNothing();
  return { agentDid, category };
}
