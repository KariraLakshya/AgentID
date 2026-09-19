export interface GrantDataResult {
  readonly agentId: string;
  readonly category: string;
}

/**
 * Grants an agent permission to see one PII category unmasked, wherever the
 * vault's live scan (`@custos/core`'s `scanAndRedact`) finds it in a tool's
 * response — independent of which tool the call went through. Without a
 * grant, that category stays redacted for this agent everywhere.
 */
export async function grantDataCategory(params: {
  readonly vaultUrl: string;
  readonly agentDid: string;
  readonly category: string;
}): Promise<GrantDataResult> {
  const { vaultUrl, agentDid, category } = params;
  const response = await fetch(new URL("/data-grants", vaultUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: agentDid, category }),
  });
  if (!response.ok) {
    throw new Error(
      `grant-data failed: vault returned ${response.status} — ${JSON.stringify(await response.json())}`,
    );
  }
  return (await response.json()) as GrantDataResult;
}
