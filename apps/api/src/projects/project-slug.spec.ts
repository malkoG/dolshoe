import { PROJECT_SLUG_PATTERN, deriveProjectSlug } from "./project-slug";

describe("deriveProjectSlug", () => {
  it.each([
    ["Checkout API", "checkout-api"],
    ["  Checkout   API  ", "checkout-api"],
    ["Checkout-API", "checkout-api"],
    ["Café Ordering", "cafe-ordering"],
    ["v2.1 Billing (EU)", "v2-1-billing-eu"],
    ["___internal___", "internal"],
    ["2026", "2026"],
  ])("turns %j into %j", (name, expected) => {
    const slug = deriveProjectSlug(name);

    expect(slug).toBe(expected);
    expect(slug).toMatch(PROJECT_SLUG_PATTERN);
  });

  it("clamps a long name without leaving a trailing separator", () => {
    const slug = deriveProjectSlug(`${"a".repeat(99)} b`);

    expect(slug).toHaveLength(99);
    expect(slug).toMatch(PROJECT_SLUG_PATTERN);
  });

  it.each([
    ["an empty name", ""],
    ["punctuation only", "!!!"],
    ["a script with no Latin form", "결제"],
  ])("refuses %s rather than inventing one", (_description, name) => {
    expect(() => deriveProjectSlug(name)).toThrow(/Supply one explicitly/);
  });
});
