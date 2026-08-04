import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { GitHubOAuthConfig, appConfig } from "../config/app-config";
import {
  GitHubEmail,
  GitHubIdentity,
  githubAccessTokenSchema,
  githubEmailListSchema,
  githubUserSchema,
  toGitHubIdentity,
} from "./github-identity";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_EMAILS_URL = "https://api.github.com/user/emails";

/**
 * `read:user` for the profile, `user:email` for the addresses behind it. Both
 * are read-only, and neither reaches a repository: signing in to an error inbox
 * is no reason to hand it code access.
 */
const SCOPES = "read:user user:email";

/**
 * GitHub is normally quick; this is only here so a hung connection surfaces as
 * a failed sign-in rather than a request that never answers.
 */
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

const logger = getLogger(["dolshoe", "auth", "github"]);

/**
 * Talks to GitHub's OAuth endpoints.
 *
 * @remarks
 * Hand-written over `fetch` rather than through an OAuth library. The web
 * application flow is two POSTs and a GET against one provider that Dolshoe will
 * never make pluggable, and a generic client would be more configuration surface
 * than the code it replaces.
 */
@Injectable()
export class GitHubOAuthClient {
  /**
   * Present exactly when this instance is configured to sign anybody in.
   * Callers check this rather than catching a failure further along.
   */
  get configuration(): GitHubOAuthConfig | undefined {
    return appConfig.github;
  }

  /**
   * Where to send the browser to start the flow.
   *
   * @param state - The value the callback will compare against its cookie. It is
   * the whole CSRF defence for this flow, so it must be unguessable.
   */
  authorizationUrl(state: string): string {
    const github = this.requireConfiguration();
    const url = new URL(AUTHORIZE_URL);

    url.searchParams.set("client_id", github.clientId);
    url.searchParams.set("redirect_uri", github.callbackUrl);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    // No "create an account" option on GitHub's screen. Somebody with no GitHub
    // account cannot have been invited to this instance, so offering them the
    // signup path only leads back here with an account that will be refused.
    url.searchParams.set("allow_signup", "false");

    return url.toString();
  }

  /**
   * Trades the code GitHub sent back for an access token.
   *
   * @remarks
   * The code is single-use and short-lived, so a rejection here is far more
   * often a replayed callback than an attack — but the two are indistinguishable
   * from the server's side, and both mean the same thing to the caller.
   */
  async exchangeCode(code: string): Promise<string> {
    const github = this.requireConfiguration();

    const response = await this.send(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: github.clientId,
        client_secret: github.clientSecret,
        code,
        redirect_uri: github.callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `GitHub refused the token exchange with ${response.status}.`,
      );
    }

    const payload = githubAccessTokenSchema.safeParse(await this.readJson(response));

    if (!payload.success) {
      throw new ServiceUnavailableException("GitHub's token response was not in a readable shape.");
    }

    if ("error" in payload.data) {
      // Logged rather than returned: GitHub's description names the client
      // configuration, which the person signing in can neither see nor fix.
      logger.warn("GitHub refused the token exchange: {error} {description}", {
        error: payload.data.error,
        description: payload.data.error_description,
      });
      throw new UnauthorizedException("That GitHub sign-in could not be completed. Try again.");
    }

    return payload.data.access_token;
  }

  /**
   * Reads the profile and addresses behind an access token.
   *
   * @remarks
   * The address list is fetched separately because a profile's public `email` is
   * null whenever the user keeps it private, which is the default. A refused
   * address list is not fatal — {@link toGitHubIdentity} falls back to GitHub's
   * own no-reply address — so the account can still be created.
   */
  async fetchIdentity(accessToken: string): Promise<GitHubIdentity> {
    const response = await this.send(USER_URL, { headers: this.apiHeaders(accessToken) });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `GitHub refused to describe the account with ${response.status}.`,
      );
    }

    const user = githubUserSchema.safeParse(await this.readJson(response));

    if (!user.success) {
      throw new ServiceUnavailableException("GitHub described the account in an unreadable shape.");
    }

    return toGitHubIdentity(user.data, await this.fetchEmails(accessToken));
  }

  private async fetchEmails(accessToken: string): Promise<GitHubEmail[]> {
    const response = await this.send(USER_EMAILS_URL, { headers: this.apiHeaders(accessToken) });

    if (!response.ok) {
      logger.info(
        "GitHub did not supply the account's addresses ({status}). Falling back to its no-reply address.",
        { status: response.status },
      );
      return [];
    }

    const addresses = githubEmailListSchema.safeParse(await this.readJson(response));

    if (!addresses.success) {
      logger.warn("GitHub listed the account's addresses in an unreadable shape.");
      return [];
    }

    return addresses.data;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "x-github-api-version": "2022-11-28",
      // GitHub asks every client to identify itself and answers 403 to those
      // that do not.
      "user-agent": "dolshoe",
    };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (cause) {
      // The operator's instance is fine; GitHub is what could not be reached.
      // Saying which keeps the wrong thing from being investigated.
      throw new ServiceUnavailableException("GitHub could not be reached to complete sign-in.", {
        cause,
      });
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new ServiceUnavailableException("GitHub's response was not JSON.", { cause });
    }
  }

  private requireConfiguration(): GitHubOAuthConfig {
    const github = this.configuration;

    if (github == null) {
      throw new ServiceUnavailableException(
        "GitHub sign-in is not configured on this instance. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL.",
      );
    }

    return github;
  }
}
