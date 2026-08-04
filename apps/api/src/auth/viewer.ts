import {
  ExecutionContext,
  InternalServerErrorException,
  createParamDecorator,
} from "@nestjs/common";

/** The account a request was authenticated as. */
export interface Viewer {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /**
   * Null only for an account created before GitHub sign-in existed and not yet
   * adopted by a GitHub account. Such a row cannot be signed into, so a viewer
   * resolved from a live session always has one — but the column allows absence
   * and this states that rather than hiding it behind an assertion.
   */
  readonly githubLogin: string | null;
  readonly avatarUrl: string | null;
  /** The session that authenticated this request, so signing out can end it. */
  readonly sessionId: string;
}

/**
 * Symbol rather than a string key, for the same reason the ingested project uses
 * one: nothing can collide with it and nothing reads it by accident.
 *
 * A different symbol from `dolshoe.ingestedProject` on purpose. The two
 * principals authorize unrelated things, and sharing a key would put them one
 * typo apart.
 */
const VIEWER = Symbol.for("dolshoe.viewer");

type RequestWithViewer = Record<PropertyKey, unknown> & { [VIEWER]?: Viewer };

export function attachViewer(request: object, viewer: Viewer): void {
  (request as RequestWithViewer)[VIEWER] = viewer;
}

export function readViewer(request: object): Viewer | undefined {
  return (request as RequestWithViewer)[VIEWER];
}

/**
 * Supplies the viewer resolved by `SessionAuthGuard`.
 *
 * @remarks
 * Throws rather than yielding `undefined`: the guard always runs first, so an
 * absent viewer means the handler was wired without it, and a controller
 * silently receiving `undefined` would act with no idea who asked.
 */
export const CurrentViewer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Viewer => {
    const request = context.switchToHttp().getRequest<object>();
    const viewer = readViewer(request);

    if (viewer == null) {
      throw new InternalServerErrorException(
        "No viewer was resolved for this request. @CurrentViewer() requires SessionAuthGuard on the same handler.",
      );
    }

    return viewer;
  },
);
