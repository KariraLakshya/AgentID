import { describe, expect, it } from "vitest";
import { scanAndRedact, type PiiCategory } from "./detect.js";

const NONE: ReadonlySet<PiiCategory> = new Set();
const VISA = "4111111111111111"; // Luhn-valid test PAN

describe("scanAndRedact", () => {
  it("detects and redacts an email when the category is not allowed", () => {
    const result = scanAndRedact({
      value: { contact: "ada@example.com" },
      allowedCategories: NONE,
    });
    expect(result.detected).toEqual(["email"]);
    expect(result.redacted).toEqual(["email"]);
    expect(result.output).toEqual({ contact: "[REDACTED:email]" });
  });

  it("detects but does not redact a category the agent is allowed to see", () => {
    const allowed = new Set<PiiCategory>(["email"]);
    const result = scanAndRedact({
      value: { contact: "ada@example.com" },
      allowedCategories: allowed,
    });
    expect(result.detected).toEqual(["email"]);
    expect(result.redacted).toEqual([]);
    expect(result.output).toEqual({ contact: "ada@example.com" });
  });

  it("redacts an SSN embedded in a longer string, leaving surrounding text intact", () => {
    const result = scanAndRedact({
      value: "SSN on file: 078-05-1120",
      allowedCategories: NONE,
    });
    expect(result.detected).toEqual(["ssn"]);
    expect(result.output).toBe("SSN on file: [REDACTED:ssn]");
  });

  it("Luhn-validates credit card candidates instead of matching any 16-digit run", () => {
    const valid = scanAndRedact({ value: VISA, allowedCategories: NONE });
    expect(valid.detected).toEqual(["credit-card"]);
    expect(valid.output).toBe("[REDACTED:credit-card]");

    const invalid = scanAndRedact({ value: "1234567890123456", allowedCategories: NONE });
    expect(invalid.detected).toEqual([]);
    expect(invalid.output).toBe("1234567890123456");
  });

  it("walks nested arrays of objects, matching Stripe- and mock-database-shaped payloads", () => {
    const result = scanAndRedact({
      value: {
        data: [
          { id: "cus_1", email: "a@b.com" },
          { id: "cus_2", email: "c@d.com" },
        ],
      },
      allowedCategories: NONE,
    });
    expect(result.detected).toEqual(["email"]);
    expect(result.output).toEqual({
      data: [
        { id: "cus_1", email: "[REDACTED:email]" },
        { id: "cus_2", email: "[REDACTED:email]" },
      ],
    });
  });

  it("finds multiple distinct categories in one payload and redacts only the disallowed ones", () => {
    const allowed = new Set<PiiCategory>(["email"]);
    const result = scanAndRedact({
      value: { email: "ada@example.com", ssn: "078-05-1120" },
      allowedCategories: allowed,
    });
    expect([...result.detected].sort()).toEqual(["email", "ssn"]);
    expect(result.redacted).toEqual(["ssn"]);
    expect(result.output).toEqual({ email: "ada@example.com", ssn: "[REDACTED:ssn]" });
  });

  it("returns empty detected/redacted for a payload with no PII", () => {
    const result = scanAndRedact({
      value: { id: "cus_1", name: "Ada Lovelace" },
      allowedCategories: NONE,
    });
    expect(result.detected).toEqual([]);
    expect(result.redacted).toEqual([]);
    expect(result.output).toEqual({ id: "cus_1", name: "Ada Lovelace" });
  });

  it("detects and redacts a phone number", () => {
    const result = scanAndRedact({ value: "Call me at 415-555-2671", allowedCategories: NONE });
    expect(result.detected).toEqual(["phone"]);
    expect(result.output).toBe("Call me at [REDACTED:phone]");
  });

  it("detects and redacts an IP address", () => {
    const result = scanAndRedact({ value: { source: "192.168.1.42" }, allowedCategories: NONE });
    expect(result.detected).toEqual(["ip-address"]);
    expect(result.output).toEqual({ source: "[REDACTED:ip-address]" });
  });

  it("leaves numbers, booleans, and null untouched", () => {
    const result = scanAndRedact({
      value: { count: 5, active: true, note: null },
      allowedCategories: NONE,
    });
    expect(result.output).toEqual({ count: 5, active: true, note: null });
  });

  it("does not throw and bottoms out on pathologically deep nesting", () => {
    let deep: unknown = "ada@example.com";
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };
    expect(() => scanAndRedact({ value: deep, allowedCategories: NONE })).not.toThrow();
  });
});
