import { PrismaService } from "../database/prisma.service";
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
});
