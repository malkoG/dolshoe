import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { environmentSchema } from "./app-config";

/** Parses `.env.example` the way dotenv does, minus interpolation nobody uses. */
function readExampleEnvironment(): Record<string, string> {
  const contents = readFileSync(resolve(__dirname, "../../../../.env.example"), "utf8");
  const values: Record<string, string> = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }

  return values;
}

describe("the shipped .env.example", () => {
  /**
   * `cp .env.example .env` is the documented first step, so an example that does
   * not satisfy this schema is an instance that refuses to start on a fresh
   * clone. Worth a test because the failure is easy to introduce — filling in
   * one half of a variable group looks like a helpful default.
   */
  it("is a configuration the API will start with", () => {
    const parsed = environmentSchema.safeParse(readExampleEnvironment());

    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it("ships no GitHub OAuth app, so a fresh instance boots and says so", () => {
    const parsed = environmentSchema.parse(readExampleEnvironment());

    expect(parsed.GITHUB_CLIENT_ID).toBeUndefined();
    expect(parsed.GITHUB_CLIENT_SECRET).toBeUndefined();
    expect(parsed.GITHUB_CALLBACK_URL).toBeUndefined();
  });
});

describe("the OAuth app variables", () => {
  const complete = {
    DATABASE_URL: "postgresql://dolshoe:dolshoe@localhost:5432/dolshoe",
    GITHUB_CLIENT_ID: "client",
    GITHUB_CLIENT_SECRET: "secret",
    GITHUB_CALLBACK_URL: "https://dolshoe.example.com/api/v1/auth/github/callback",
  };

  it("are accepted together", () => {
    expect(environmentSchema.safeParse(complete).success).toBe(true);
  });

  it.each(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_CALLBACK_URL"])(
    "are refused when %s is the one left out",
    (missing) => {
      // Caught at startup rather than at the redirect, which is the only moment
      // a partial set would otherwise show up — long after anyone was watching.
      const partial = { ...complete, [missing]: "" };

      expect(environmentSchema.safeParse(partial).success).toBe(false);
    },
  );

  it("treats an empty allowlist as no restriction rather than as nobody", () => {
    expect(environmentSchema.parse(complete).GITHUB_ALLOWED_LOGINS).toEqual([]);
  });

  it("lowercases and trims the allowlist", () => {
    const parsed = environmentSchema.parse({
      ...complete,
      GITHUB_ALLOWED_LOGINS: " Octocat , malkoG ,",
    });

    expect(parsed.GITHUB_ALLOWED_LOGINS).toEqual(["octocat", "malkog"]);
  });
});
