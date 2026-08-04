import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { MockLoginRequest, MockLoginResponse, mockLoginRequestSchema } from "./auth.contract";
import { mockIdentity } from "./mock-login";
import { OriginCheckableRequest, assertSameOrigin } from "./same-origin";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./session-cookie";
import { SessionService } from "./session.service";
import { SignInRefusedError } from "./sign-in-refusal";

interface CookieResponse {
  cookie(name: string, value: string, options: object): unknown;
}

const logger = getLogger(["dolshoe", "auth"]);

/**
 * Signing in during development, without GitHub.
 *
 * @remarks
 * Registering an OAuth app, pinning a port so its callback URL stops moving, and
 * filling in three variables is a lot to ask of somebody who has just cloned the
 * repository and wants to see a screen. This skips all of it: say who you are and
 * you are that account.
 *
 * Which is exactly as dangerous as it sounds, so the door is opened only by an
 * explicit `MOCK_LOGIN`, and an instance that sets it in production does not
 * start at all — see `app-config.ts`. With the flag off this answers 404, so an
 * instance that never opted in is indistinguishable from one built without the
 * route.
 *
 * Only the identity is fabricated. `AuthService.signInWithGitHub` then runs
 * unchanged, so the allowlist still applies, the first login still claims the
 * instance, everyone after it still needs an invitation, and a development
 * instance behaves like a deployed one.
 *
 * `POST` rather than the redirect pair GitHub needs, because nothing here leaves
 * this origin: the sign-in page calls it with `fetch` and navigates itself.
 */
@ApiTags("Authentication")
@Controller({ path: "auth/mock", version: "1" })
export class MockLoginController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post("session")
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: { $ref: "#/components/schemas/MockLoginRequestV1" } })
  @ApiOkResponse({
    description: "Signed in, with the session cookie set.",
    schema: { $ref: "#/components/schemas/MockLoginResponseV1" },
  })
  @ApiForbiddenResponse({
    description: "The instance refused the sign-in, with the code the sign-in page explains.",
  })
  @ApiNotFoundResponse({ description: "This instance does not run with MOCK_LOGIN." })
  async signIn(
    @Req() request: OriginCheckableRequest,
    @Body(
      new ZodValidationPipe(
        mockLoginRequestSchema,
        "Request body does not match the mock sign-in contract.",
      ),
    )
    body: MockLoginRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<MockLoginResponse> {
    // Read per request rather than deciding at module construction, so that the
    // route's absence and the flag being off are the same thing to a caller, and
    // so tests can flip it the way `ingest-auth.guard.spec.ts` already does.
    if (!appConfig.mockLogin) {
      throw new NotFoundException("Not found");
    }

    // The same second CSRF lock `SessionAuthGuard` applies. A missing `Origin` is
    // allowed there and here, which is what keeps `curl` able to start a session
    // — the point of this endpoint for anyone working against the API.
    assertSameOrigin(request);

    try {
      const { viewer, organizationSlug } = await this.authService.signInWithGitHub(
        mockIdentity(body.login),
        body.invitation,
      );

      const session = await this.sessionService.create(viewer.id);
      response.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));

      // Warned rather than logged at info: a session that nobody proved anything
      // to obtain should be conspicuous in the log it appears in.
      logger.warn("{githubLogin} signed in through the development mock.", {
        githubLogin: viewer.githubLogin,
      });

      return { viewer, organizationSlug: organizationSlug ?? null };
    } catch (error) {
      if (error instanceof SignInRefusedError) {
        // The code, because the sign-in page already has wording for every one of
        // them from the GitHub flow. The message is the server's own account of
        // what happened, which is safe to hand back on an instance where anybody
        // can already sign in as anybody.
        throw new ForbiddenException({ error: error.code, message: error.message });
      }

      throw error;
    }
  }
}
