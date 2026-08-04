import {
  decodeOAuthState,
  encodeOAuthState,
  generateOAuthNonce,
  nonceMatches,
  readOAuthStateCookie,
  safeRedirectPath,
} from "./oauth-state";

describe("safeRedirectPath", () => {
  it("accepts a path on this site", () => {
    expect(safeRedirectPath("/orgs/acme/projects")).toBe("/orgs/acme/projects");
  });

  it.each([
    ["another origin", "https://attacker.example/"],
    ["a protocol-relative URL a browser reads as another origin", "//attacker.example/"],
    ["something that is not a path at all", "orgs"],
    ["a value that is not a string", 7],
  ])("refuses %s", (_description, value) => {
    expect(safeRedirectPath(value)).toBeUndefined();
  });
});

describe("the state cookie", () => {
  it("carries the redirect and invitation through a round trip", () => {
    const state = { nonce: "n", redirect: "/orgs", invitationToken: "dsi_abc" };

    expect(decodeOAuthState(encodeOAuthState(state))).toEqual(state);
  });

  it("re-checks the redirect on the way out", () => {
    // A cookie written by an older deployment is still ours, but it is not
    // trusted to have been shaped the way this version expects.
    const tampered = encodeOAuthState({
      nonce: "n",
      redirect: "//attacker.example",
    });

    expect(decodeOAuthState(tampered)?.redirect).toBe("/");
  });

  it.each([
    ["a missing cookie", undefined],
    ["something that is not base64url JSON", "not-a-state"],
    [
      "a payload with no nonce",
      Buffer.from(JSON.stringify({ redirect: "/" })).toString("base64url"),
    ],
  ])("reads %s as no state at all", (_description, value) => {
    expect(decodeOAuthState(value)).toBeUndefined();
  });

  it("finds itself in a header holding other cookies", () => {
    const header = "other=1; dolshoe_oauth_state=abc; dolshoe_session=dsv_x";

    expect(readOAuthStateCookie(header)).toBe("abc");
  });
});

describe("nonceMatches", () => {
  it("accepts the nonce it issued", () => {
    const nonce = generateOAuthNonce();

    expect(nonceMatches(nonce, nonce)).toBe(true);
  });

  it("refuses a different nonce, including a prefix of the right one", () => {
    const nonce = generateOAuthNonce();

    expect(nonceMatches(generateOAuthNonce(), nonce)).toBe(false);
    expect(nonceMatches(nonce.slice(0, -1), nonce)).toBe(false);
  });
});
