import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { ZodValidationPipe } from "../error-reporting/zod-validation.pipe";
import { AuthService } from "./auth.service";
import {
  LoginRequest,
  RegisterRequest,
  SessionResponse,
  Viewer,
  loginRequestSchema,
  registerRequestSchema,
} from "./auth.contract";
import { loginExample, registerExample } from "./auth.examples";
import { SameOriginGuard } from "./same-origin.guard";
import { SessionAuthGuard } from "./session-auth.guard";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  readSessionCookie,
  sessionCookieOptions,
} from "./session-cookie";
import { SessionService } from "./session.service";
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
}

/**
 * Registration, sign-in, sign-out, and "who am I".
 *
 * @remarks
 * These four are the only session routes that cannot require a session, so they
 * carry `SameOriginGuard` instead: a cross-site sign-in would leave a victim's
 * browser authenticated as an account the attacker controls.
 */
@ApiTags("Authentication")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
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
    description: "Who the caller is, and whether this instance has been claimed.",
    schema: { $ref: "#/components/schemas/SessionResponseV1" },
  })
  async session(@Req() request: CookieRequest): Promise<SessionResponse> {
    const instanceClaimed = await this.authService.isInstanceClaimed();
    const viewer = await this.resolveViewer(request);

    return { viewer, instanceClaimed };
  }

  /**
   * Claim an unclaimed instance.
   *
   * @remarks
   * Succeeds only while the instance has no accounts, and signs the new account
   * in so claiming and using it are one step.
   */
  @Post("register")
  @UseGuards(SameOriginGuard)
  @ApiBody({
    schema: { $ref: "#/components/schemas/RegisterRequestV1" },
    examples: { ops: { summary: "First operator", value: registerExample } },
  })
  @ApiCreatedResponse({
    description: "The account was created and signed in.",
    schema: { $ref: "#/components/schemas/ViewerV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the registration contract." })
  @ApiConflictResponse({ description: "This instance has already been claimed." })
  @ApiForbiddenResponse({ description: "The request came from another origin." })
  async register(
    @Body(
      new ZodValidationPipe(
        registerRequestSchema,
        "Request body does not match the registration contract.",
      ),
    )
    request: RegisterRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<Viewer> {
    const viewer = await this.authService.register(request);
    await this.startSession(viewer.id, response);

    return viewer;
  }

  /**
   * Sign in.
   */
  @Post("login")
  @UseGuards(SameOriginGuard)
  // Signing in resolves an existing account rather than creating a resource, so
  // this is not a 201 despite being a POST.
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: { $ref: "#/components/schemas/LoginRequestV1" },
    examples: { ops: { summary: "Existing operator", value: loginExample } },
  })
  @ApiOkResponse({
    description: "Signed in. The session cookie is set on this response.",
    schema: { $ref: "#/components/schemas/ViewerV1" },
  })
  @ApiBadRequestResponse({ description: "The body does not satisfy the sign-in contract." })
  @ApiUnauthorizedResponse({ description: "That email and password do not match an account." })
  @ApiForbiddenResponse({ description: "The request came from another origin." })
  async login(
    @Body(
      new ZodValidationPipe(
        loginRequestSchema,
        "Request body does not match the sign-in contract.",
      ),
    )
    request: LoginRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<Viewer> {
    const viewer = await this.authService.authenticate(request);
    await this.startSession(viewer.id, response);

    return viewer;
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

  private async startSession(userId: string, response: CookieResponse): Promise<void> {
    const session = await this.sessionService.create(userId);
    response.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));
  }

  /**
   * Resolves the cookie without the guard, because this endpoint has to answer
   * for signed-out callers too. Every failure means the same thing here — nobody
   * is signed in — so they collapse to null rather than to distinct errors.
   */
  private async resolveViewer(request: CookieRequest): Promise<Viewer | null> {
    const cookie = request.headers.cookie;
    const raw = readSessionCookie(Array.isArray(cookie) ? cookie.join("; ") : cookie);
    if (raw == null) return null;

    const prefix = parseSessionTokenPrefix(raw);
    if (prefix == null) return null;

    try {
      const viewer = await this.sessionService.verify(raw, prefix);
      return { id: viewer.id, email: viewer.email, name: viewer.name };
    } catch {
      return null;
    }
  }
}
