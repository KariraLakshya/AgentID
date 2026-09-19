/**
 * Pattern-based PII detection and redaction. Deliberately NOT a claim of
 * ML-grade entity recognition — this is regex matching (plus a Luhn
 * checksum for card numbers, to cut false positives on random 16-digit
 * strings), run on the actual values a tool call returned. That is a real,
 * honest technique (the same class of thing DLP products call "pattern
 * matching," distinct from the heavier, probabilistic OCR/vision-based
 * content inspection this project has separately and deliberately scoped
 * out — see CLAUDE.md section 2). It is a live scan of real response data,
 * not a static per-tool declaration like `Connector.dataCategories`.
 */
export type PiiCategory = "email" | "phone" | "ssn" | "credit-card" | "ip-address";

export const PII_CATEGORIES: readonly PiiCategory[] = [
  "email",
  "phone",
  "ssn",
  "credit-card",
  "ip-address",
];

interface PiiPattern {
  readonly category: PiiCategory;
  readonly pattern: RegExp;
  /** Extra check beyond the regex — used by credit-card's Luhn validation. */
  readonly validate?: (match: string) => boolean;
}

function luhnValid(digits: string): boolean {
  const cleaned = digits.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(cleaned)) return false;
  let sum = 0;
  let double = false;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    let digit = Number(cleaned[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

// Order matters only for readability; each pattern is evaluated independently.
const PATTERNS: readonly PiiPattern[] = [
  { category: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { category: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    category: "credit-card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: luhnValid,
  },
  { category: "phone", pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { category: "ip-address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

export interface ScanAndRedactResult {
  readonly output: unknown;
  /** Every category found, whether or not it was redacted. */
  readonly detected: readonly PiiCategory[];
  /** The subset of `detected` that was NOT in `allowedCategories`, and so was masked. */
  readonly redacted: readonly PiiCategory[];
}

const MAX_DEPTH = 6;

function redactString(
  value: string,
  allowedCategories: ReadonlySet<PiiCategory>,
  detected: Set<PiiCategory>,
  redacted: Set<PiiCategory>,
): string {
  let output = value;
  for (const { category, pattern, validate } of PATTERNS) {
    // Fresh regex per call (module-level `g` patterns carry lastIndex state
    // that would otherwise leak across calls) — cheap, and correctness over
    // micro-optimisation on payloads this small.
    const matcher = new RegExp(pattern.source, pattern.flags);
    let matched = false;
    output = output.replace(matcher, (candidate) => {
      if (validate && !validate(candidate)) return candidate;
      matched = true;
      if (allowedCategories.has(category)) return candidate;
      return `[REDACTED:${category}]`;
    });
    if (matched) {
      detected.add(category);
      if (!allowedCategories.has(category)) redacted.add(category);
    }
  }
  return output;
}

function walk(
  value: unknown,
  allowedCategories: ReadonlySet<PiiCategory>,
  detected: Set<PiiCategory>,
  redacted: Set<PiiCategory>,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === "string") {
    return redactString(value, allowedCategories, detected, redacted);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, allowedCategories, detected, redacted, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = walk(item, allowedCategories, detected, redacted, depth + 1);
    }
    return output;
  }
  return value;
}

/**
 * Scans `value` for PII (recursively over plain objects/arrays, matching
 * within each string field individually rather than redacting a whole
 * field) and masks any detected category not present in `allowedCategories`.
 * Pure and synchronous — safe on the hot path (CLAUDE.md section 3): no I/O,
 * no network, cost bounded by payload size and a fixed recursion depth.
 */
export function scanAndRedact(params: {
  readonly value: unknown;
  readonly allowedCategories: ReadonlySet<PiiCategory>;
}): ScanAndRedactResult {
  const detected = new Set<PiiCategory>();
  const redacted = new Set<PiiCategory>();
  const output = walk(params.value, params.allowedCategories, detected, redacted, 0);
  return { output, detected: [...detected], redacted: [...redacted] };
}
