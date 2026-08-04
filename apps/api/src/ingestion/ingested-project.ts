import {
  ExecutionContext,
  InternalServerErrorException,
  createParamDecorator,
} from "@nestjs/common";

/** The project an ingestion request was authenticated as. */
export interface IngestedProject {
  readonly id: string;
  readonly slug: string;
}

/**
 * Symbol rather than a string key so the resolved project cannot collide with a
 * property some middleware puts on the request, and so nothing reads it by
 * accident.
 */
const INGESTED_PROJECT = Symbol.for("dolshoe.ingestedProject");

type RequestWithIngestedProject = Record<PropertyKey, unknown> & {
  [INGESTED_PROJECT]?: IngestedProject;
};

export function attachIngestedProject(request: object, project: IngestedProject): void {
  (request as RequestWithIngestedProject)[INGESTED_PROJECT] = project;
}

export function readIngestedProject(request: object): IngestedProject | undefined {
  return (request as RequestWithIngestedProject)[INGESTED_PROJECT];
}

/**
 * Supplies the project resolved by `IngestAuthGuard`.
 *
 * @remarks
 * Throws rather than yielding `undefined`: the guard always runs first, so an
 * absent project means the handler was wired without it, and a controller
 * silently receiving `undefined` would write events under no project at all.
 */
export const IngestProject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IngestedProject => {
    const request = context.switchToHttp().getRequest<object>();
    const project = readIngestedProject(request);

    if (project == null) {
      throw new InternalServerErrorException(
        "No ingestion project was resolved for this request. @IngestProject() requires IngestAuthGuard on the same handler.",
      );
    }

    return project;
  },
);
