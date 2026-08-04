import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { getLogger } from "@logtape/logtape";

import { cookieHeader } from "./cookies";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { InvitationService } from "../organizations/invitation.service";
import {
  AcceptInvitationRequest,
  acceptInvitationRequestSchema,
} from "../organizations/organization.contract";
import { OrganizationService } from "../organizations/organization.service";
import { AuthService } from "./auth.service";
import { SessionResponse, Viewer } from "./auth.contract";
import { GitHubOAuthClient } from "./github-oauth.client";
import {
  OAUTH_STATE_COOKIE_NAME,
  clearedOAuthStateCookieOptions,
  decodeOAuthState,
  encodeOAuthState,
  generateOAuthNonce,
  nonceMatches,
  oauthStateCookieOptions,
  readOAuthStateCookie,
  safeRedirectPath,
} from "./oauth-state";
import { SessionAuthGuard } from "./session-auth.guard";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  readSessionCookie,
  sessionCookieOptions,
} from "./session-cookie";
import { SessionService } from "./session.service";
import { SignInRefusalCode, SignInRefusedError } from "./sign-in-refusal";
import { CurrentViewer, Viewer as ResolvedViewer } from "./viewer";
import { parseSessionTokenPrefix } from "./session-token";

/**
 * Minimal shapes of the Express request and response, declared here rather than
 * importing Express's types, so the controller states exactly what it touches.
 */
interface CookieRequest {
  headers: { cookie?: string | string[] };
}

interface CookieResponse {
  cookie(name: string, value: string, options: object): unknown;
  redirect(url: string): unknown;
}

/** Where the browser is sent when a sign-in cannot be completed. */
const SIGN_IN_PATH = "/login";

const logger = getLogger(["dolshoe", "auth"]);

/**
 * Signing in, signing out, and "who am I".
 *
 * @remarks
 * GitHub is the only way in, so signing in is two redirects rather than a form
 * post: `github/start` sends the browser to GitHub, `github/callback` receives
 * it back. Neither can require a session — that is the thing being established —
 * so the pair is protected by the `state` cookie instead, which is what keeps
 * another site from walking a victim's browser through a sign-in as an account
 * the attacker controls.
 *
 * Both are `GET` because a browser arrives at them by navigation. That is also
 * why they answer with a redirect rather than JSON: nothing here is called by
 * `fetch`, so a body would never be read.
 */
@ApiTags("Authentication")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly organizationService: OrganizationService,
    private readonly invitationService: InvitationService,
    private readonly github: GitHubOAuthClient,
  ) {}

  /**
   * Describe the caller.
   *
   * @remarks
   * Answers 200 whether or not anyone is signed in — being signed out is a
   * normal state, not an error — so the web app can ask this once on every load
   * without treating the common case as a failure. An unreadable or expired
   * cookie is reported the same as no cookie at all.
   */
  @Get("session")
  @ApiOkResponse({
    description: "Who the caller is, whether this instance is claimed, and whether it can sign in.",
    schema: { $ref: "#/components/schemas/SessionResponseV1" },
  })
  async session(@Req() request: CookieRequest): Promise<SessionResponse> {
    const instanceClaimed = await this.authService.isInstanceClaimed();
    const githubSignInConfigured = this.github.configuration != null;
    const viewer = await this.resolveViewer(request);

    if (viewer == null) {
      return { viewer: null, organizations: [], instanceClaimed, githubSignInConfigured };
    }

    // Answered here rather than leaving the browser to ask separately, because
    // every page needs both to decide where the caller even belongs.
    const { organizations } = await this.organizationService.listForViewer(viewer.id);

    return { viewer, organizations, instanceClaimed, githubSignInConfigured };
  }

  /**
   * Begin signing in with GitHub.
   *
   * @remarks
   * Remembers where to return to, and any invitation being redeemed, in the
   * `state` cookie rather than in the `state` parameter GitHub echoes back. Only
   * an unguessable nonce travels through GitHub, so a crafted callback cannot
   * choose where somebody lands or which invitation their sign-in spends.
   */
  @Get("github/start")
  @ApiQuery({ name: "redirect", required: false, description: "A path on this site to return to." })
  @ApiQuery({
    name: "invitation",
    required: false,
    description: "An invitation token, when the sign-in started from an invitation link.",
  })
  @ApiFoundResponse({ description: "Redirects to GitHub's authorization screen." })
  start(
    @Query("redirect") redirect: string | undefined,
    @Query("invitation") invitation: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): void {
    if (this.github.configuration == null) {
      // Not an exception: the browser is here by navigation and would be shown a
      // JSON error page. The sign-in page explains this state properly.
      this.refuse(response, "not_configured");
      return;
    }

    const nonce = generateOAuthNonce();
    const state = {
      nonce,
      redirect: safeRedirectPath(redirect) ?? "/",
      invitationToken: invitation,
    };

    response.cookie(OAUTH_STATE_COOKIE_NAME, encodeOAuthState(state), oauthStateCookieOptions());
    response.redirect(this.github.authorizationUrl(nonce));
  }

  /**
   * Finish signing in with GitHub.
   *
   * @remarks
   * Every failure here ends the same way: the state cookie is cleared and the
   * browser is sent back to the sign-in page with a code naming what went wrong.
   * Throwing instead would show an API error page to somebody who was in the
   * middle of a navigation, with no way back into the app.
   */
  @Get("github/callback")
  @ApiQuery({ name: "code", required: false })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({
    name: "error",
    required: false,
    description: "Set when GitHub refused or the person declined.",
  })
  @ApiFoundResponse({
    description:
      "Redirects into the app on success, or back to the sign-in page with an `error` code.",
  })
  async callback(
    @Req() request: CookieRequest,
    @Query("code") code: string | undefined,
    @Query("state") presentedNonce: string | undefined,
    @Query("error") githubError: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    const state = decodeOAuthState(readOAuthStateCookie(cookieHeader(request.headers.cookie)));

    response.cookie(OAUTH_STATE_COOKIE_NAME, "", clearedOAuthStateCookieOptions());

    // Declining at GitHub's screen is a choice, not a fault. Checked before the
    // state so somebody who cancelled is told that rather than something odd
    // about a cookie.
    if (githubError != null) {
      this.refuse(response, "denied");
      return;
    }

    if (state == null || presentedNonce == null || !nonceMatches(presentedNonce, state.nonce)) {
      this.refuse(response, "state");
      return;
    }

    if (code == null || code.length === 0) {
      this.refuse(response, "state");
      return;
    }

    try {
      const identity = await this.github.fetchIdentity(await this.github.exchangeCode(code));
      const { viewer, organizationSlug } = await this.authService.signInWithGitHub(
        identity,
        state.invitationToken,
      );

      await this.startSession(viewer.id, response);

      logger.info("{githubLogin} signed in.", { githubLogin: identity.githubLogin });

      // An invitation decides where somebody lands: they came here to join that
      // organization, and it beats a remembered path from before they had one.
      response.redirect(
        organizationSlug == null ? state.redirect : `/orgs/${organizationSlug}/projects`,
      );
    } catch (error) {
      if (error instanceof SignInRefusedError) {
        this.refuse(response, error.code);
        return;
      }

      // Reaching GitHub, or GitHub itself, failed. Logged here because this is
      // the boundary that decides to present it as a failed sign-in rather than
      // as a stack trace.
      logger.error("A GitHub sign-in could not be completed: {error}", { error });
      this.refuse(response, "github_unavailable");
    }
  }

  /**
   * Sign out.
   *
   * @remarks
   * Ends the session server-side, so the cookie is worthless even if a copy of
   * it was kept. Idempotent: signing out of a session another tab already ended
   * still clears the cookie and still succeeds.
   */
  @Post("logout")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth("session")
  @ApiNoContentResponse({ description: "Signed out and the session cookie cleared." })
  @ApiUnauthorizedResponse({ description: "No session was presented." })
  async logout(
    @CurrentViewer() viewer: ResolvedViewer,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.sessionService.revoke(viewer.sessionId);
    response.cookie(SESSION_COOKIE_NAME, "", clearedSessionCookieOptions());
  }

  /**
   * Accept an invitation as the account already signed in.
   *
   * @remarks
   * Signed out, there is nothing for this to do: the account does not exist yet
   * and only GitHub can establish who is asking. That case goes through
   * `github/start?invitation=…` instead, which redeems the link as part of
   * signing in.
   */
  @Post("invitations/accept")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("session")
  @ApiBody({ schema: { $ref: "#/components/schemas/AcceptInvitationRequestV1" } })
  @ApiOkResponse({ description: "The invitation was accepted." })
  @ApiUnauthorizedResponse({ description: "No signed-in session was presented." })
  async acceptInvitation(
    @CurrentViewer() viewer: ResolvedViewer,
    @Body(
      new ZodValidationPipe(
        acceptInvitationRequestSchema,
        "Request body does not match the invitation contract.",
      ),
    )
    body: AcceptInvitationRequest,
  ): Promise<{ organizationSlug: string }> {
    return this.invitationService.acceptAsViewer(body.token, viewer);
  }

  private async startSession(userId: string, response: CookieResponse): Promise<void> {
    const session = await this.sessionService.create(userId);
    response.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));
  }

  private refuse(response: CookieResponse, code: SignInRefusalCode): void {
    response.redirect(`${SIGN_IN_PATH}?error=${code}`);
  }

  /**
   * Resolves the cookie without the guard, because this endpoint has to answer
   * for signed-out callers too. Every failure means the same thing here — nobody
   * is signed in — so they collapse to null rather than to distinct errors.
   */
  private async resolveViewer(request: CookieRequest): Promise<Viewer | null> {
    const raw = readSessionCookie(cookieHeader(request.headers.cookie));
    if (raw == null) return null;

    const prefix = parseSessionTokenPrefix(raw);
    if (prefix == null) return null;

    try {
      const viewer = await this.sessionService.verify(raw, prefix);
      return {
        id: viewer.id,
        email: viewer.email,
        name: viewer.name,
        githubLogin: viewer.githubLogin,
        avatarUrl: viewer.avatarUrl,
      };
    } catch {
      return null;
    }
  }
}
