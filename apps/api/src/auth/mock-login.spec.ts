import { mockLoginRequestSchema } from "./auth.contract";
import { MAXIMUM_MOCK_LOGIN_LENGTH, mockIdentity } from "./mock-login";

describe("a mock identity", () => {
  it("is the same account every time a login signs in", () => {
    expect(mockIdentity("octocat").githubUserId).toEqual(mockIdentity("octocat").githubUserId);
  });

  it("is a different account for a different login", () => {
    expect(mockIdentity("octocat").githubUserId).not.toEqual(mockIdentity("malkog").githubUserId);
  });

  /**
   * `User.githubUserId` is `VarChar(32)`. Overrunning it would only show up as a
   * database error at the moment somebody signed in with a long login, which is
   * a poor place to discover a column width.
   */
  it("fits the column that stores it, even at the longest accepted login", () => {
    const longest = "a".repeat(MAXIMUM_MOCK_LOGIN_LENGTH);

    expect(mockIdentity(longest).githubUserId.length).toBeLessThanOrEqual(32);
  });

  /**
   * `AuthService` adopts an account that predates GitHub sign-in by matching its
   * address, so an address anybody can conjure must not be one a real account
   * could hold. `.invalid` is reserved by RFC 2606 and never resolves.
   */
  it("is addressed at a domain that can never exist", () => {
    expect(mockIdentity("octocat").email).toMatch(/@mock\.invalid$/);
  });
});

describe("the mock sign-in contract", () => {
  it("lowercases a login, because GitHub treats logins case-insensitively", () => {
    expect(mockLoginRequestSchema.parse({ login: "Octocat" }).login).toBe("octocat");
  });

  it("accepts a login with inner hyphens, as GitHub does", () => {
    expect(mockLoginRequestSchema.safeParse({ login: "the-octo-cat" }).success).toBe(true);
  });

  it.each([
    ["one that is empty", ""],
    ["one that would overrun the id column", "a".repeat(MAXIMUM_MOCK_LOGIN_LENGTH + 1)],
    ["one carrying an address", "octocat@example.com"],
    ["one carrying a space", "octo cat"],
    ["one starting with a hyphen", "-octocat"],
    ["one with doubled hyphens", "octo--cat"],
  ])("refuses %s", (_description, login) => {
    expect(mockLoginRequestSchema.safeParse({ login }).success).toBe(false);
  });

  it("refuses a field it does not know, rather than ignoring it", () => {
    expect(mockLoginRequestSchema.safeParse({ login: "octocat", role: "OWNER" }).success).toBe(
      false,
    );
  });
});
