import { PrismaService } from "../database/prisma.service";
import { ERROR_REPORT_LIST_LIMIT } from "./error-report.contract";
import { nodeErrorReportExample } from "./error-report.examples";
import { ErrorReportService } from "./error-report.service";

const ORGANIZATION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";

describe("ErrorReportService", () => {
  it("maps the normalized contract to one idempotent persistence operation", async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
      receivedAt: new Date("2026-07-24T09:00:00.000Z"),
    });
    const database = {
      errorReport: {
        upsert,
      },
    } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await expect(service.receive(nodeErrorReportExample, PROJECT_ID)).resolves.toEqual({
      id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
      receivedAt: "2026-07-24T09:00:00.000Z",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_eventId: {
            projectId: PROJECT_ID,
            eventId: nodeErrorReportExample.eventId,
          },
        },
        update: {},
        create: expect.objectContaining({
          projectId: PROJECT_ID,
          serviceName: "checkout-api",
          runtimeName: "node",
          exception: nodeErrorReportExample.exception,
        }),
      }),
    );
  });

  it("lists persisted reports newest-first, bounded to the documented limit", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
        eventId: nodeErrorReportExample.eventId,
        occurredAt: new Date("2026-07-24T08:30:00.000Z"),
        receivedAt: new Date("2026-07-24T09:00:00.000Z"),
        serviceName: "checkout-api",
        environment: "production",
        release: "2026.07.24.1",
        runtimeName: "node",
        runtimeVersion: "24.4.1",
        exception: nodeErrorReportExample.exception,
        project: { id: PROJECT_ID, slug: "checkout-api", name: "Checkout API" },
      },
    ]);
    const database = {
      errorReport: {
        findMany,
      },
    } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await expect(service.list(ORGANIZATION_ID, PROJECT_ID)).resolves.toEqual({
      reports: [
        {
          id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
          eventId: nodeErrorReportExample.eventId,
          occurredAt: "2026-07-24T08:30:00.000Z",
          receivedAt: "2026-07-24T09:00:00.000Z",
          project: { id: PROJECT_ID, slug: "checkout-api", name: "Checkout API" },
          service: {
            name: "checkout-api",
            environment: "production",
            release: "2026.07.24.1",
          },
          runtime: {
            name: "node",
            version: "24.4.1",
          },
          exception: {
            type: "TypeError",
            message: "Cannot read properties of undefined",
            source: {
              fileName: "file:///srv/app/order.js",
              lineNumber: 42,
              columnNumber: 18,
              functionName: "submitOrder",
            },
          },
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { receivedAt: "desc" },
        take: ERROR_REPORT_LIST_LIMIT,
      }),
    );
    // Every listing is scoped now; there is no longer an unfiltered one.
    expect(findMany.mock.calls[0][0]).toHaveProperty("where");
  });

  it("scopes the listing to the project and the organization that owns it", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const database = { errorReport: { findMany } } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await service.list(ORGANIZATION_ID, PROJECT_ID);

    // Both halves, so a project id from another tenant matches nothing here
    // rather than relying on a check further up having happened.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID, project: { organizationId: ORGANIZATION_ID } },
      }),
    );
  });

  it("returns an empty list when no reports are persisted", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const database = {
      errorReport: {
        findMany,
      },
    } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await expect(service.list(ORGANIZATION_ID, PROJECT_ID)).resolves.toEqual({ reports: [] });
  });
});
