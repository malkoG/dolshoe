import { GitHubUser, selectVerifiedEmail, toGitHubIdentity } from "./github-identity";

const USER: GitHubUser = {
  id: 583231,
  login: "Octocat",
  name: "The Octocat",
  email: "public@example.com",
  avatar_url: "https://avatars.example/u/583231",
};

describe("selectVerifiedEmail", () => {
  it("prefers the verified primary address", () => {
    const address = selectVerifiedEmail(USER, [
      { email: "secondary@example.com", primary: false, verified: true },
      { email: "primary@example.com", primary: true, verified: true },
    ]);

    expect(address).toBe("primary@example.com");
  });

  it("ignores an unverified address, however it is presented", () => {
    // The rule that makes adopting a pre-GitHub account by address safe: an
    // unverified address is only a claim the account made about itself.
    const address = selectVerifiedEmail(USER, [
      { email: "primary@example.com", primary: true, verified: false },
      { email: "public@example.com", primary: false, verified: false },
      { email: "verified@example.com", primary: false, verified: true },
    ]);

    expect(address).toBe("verified@example.com");
  });

  it("falls back to GitHub's no-reply address when nothing is verified", () => {
    const address = selectVerifiedEmail(USER, [
      { email: "primary@example.com", primary: true, verified: false },
    ]);

    expect(address).toBe("583231+octocat@users.noreply.github.com");
  });

  it("falls back when the address list could not be read at all", () => {
    expect(selectVerifiedEmail(USER, [])).toBe("583231+octocat@users.noreply.github.com");
  });
});

describe("toGitHubIdentity", () => {
  it("lowercases the login and keeps the numeric id as the identity", () => {
    const identity = toGitHubIdentity(USER, [
      { email: "primary@example.com", primary: true, verified: true },
    ]);

    expect(identity).toEqual({
      githubUserId: "583231",
      githubLogin: "octocat",
      name: "The Octocat",
      email: "primary@example.com",
      avatarUrl: "https://avatars.example/u/583231",
    });
  });

  it("names an account with no profile name after its login", () => {
    const identity = toGitHubIdentity({ ...USER, name: null, avatar_url: null }, []);

    expect(identity.name).toBe("Octocat");
    expect(identity.avatarUrl).toBeUndefined();
  });
});
