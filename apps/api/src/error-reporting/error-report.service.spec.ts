import { PrismaService } from "../database/prisma.service";
import { ERROR_REPORT_LIST_LIMIT } from "./error-report.contract";
import { nodeErrorReportExample } from "./error-report.examples";
import { ErrorReportService } from "./error-report.service";

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

    await expect(service.receive(nodeErrorReportExample)).resolves.toEqual({
      id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
      receivedAt: "2026-07-24T09:00:00.000Z",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: nodeErrorReportExample.eventId,
        },
        update: {},
        create: expect.objectContaining({
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
      },
    ]);
    const database = {
      errorReport: {
        findMany,
      },
    } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await expect(service.list()).resolves.toEqual({
      reports: [
        {
          id: "07cf25d3-35aa-4b30-b4e2-bc3649858147",
          eventId: nodeErrorReportExample.eventId,
          occurredAt: "2026-07-24T08:30:00.000Z",
          receivedAt: "2026-07-24T09:00:00.000Z",
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
  });

  it("returns an empty list when no reports are persisted", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const database = {
      errorReport: {
        findMany,
      },
    } as unknown as PrismaService;
    const service = new ErrorReportService(database);

    await expect(service.list()).resolves.toEqual({ reports: [] });
  });
});
