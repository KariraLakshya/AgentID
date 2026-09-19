export interface AuditOutcome {
  readonly agentDid: string;
  readonly tool: string;
  readonly action: string;
  readonly dataCategories: readonly string[];
  readonly policy: { readonly rule: string; readonly decision: "allow" | "deny" };
  readonly reason?: string;
  readonly detectedCategories?: readonly string[];
  readonly redactedCategories?: readonly string[];
  readonly now: Date;
}

/**
 * Reports one action outcome to the audit service. `report()` returns
 * `void`, never a promise the caller could await — an audit write must
 * never land on the hot path or the response path (CLAUDE.md section 3).
 */
export interface AuditReporter {
  report(outcome: AuditOutcome): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fire-and-forget HTTP push to the audit service's `POST /records`. A
 * failure here (audit service down, network blip) is logged via `onError`
 * and otherwise swallowed — losing one audit write must never fail, slow, or
 * retry-block the request that triggered it.
 */
export function createHttpAuditReporter(params: {
  readonly auditUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly onError?: (error: unknown) => void;
}): AuditReporter {
  const { auditUrl, fetchImpl = fetch, onError } = params;

  return {
    report(outcome) {
      const body = {
        agentDid: outcome.agentDid,
        tool: outcome.tool,
        action: outcome.action,
        dataCategories: outcome.dataCategories,
        policy: outcome.policy,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.detectedCategories === undefined
          ? {}
          : { detectedCategories: outcome.detectedCategories }),
        ...(outcome.redactedCategories === undefined
          ? {}
          : { redactedCategories: outcome.redactedCategories }),
        recordedAt: outcome.now.toISOString(),
      };
      void fetchImpl(new URL("/records", auditUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((response) => {
          if (!response.ok && onError)
            onError(new Error(`audit service returned HTTP ${response.status}`));
        })
        .catch((error: unknown) => {
          if (onError) onError(new Error(errorMessage(error)));
        });
    },
  };
}

/** Used when no audit service is configured — reporting is a no-op. */
export function createNoopAuditReporter(): AuditReporter {
  return { report: () => undefined };
}
