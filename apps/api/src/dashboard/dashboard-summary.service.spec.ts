import { NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { DashboardSummaryRepository } from "./dashboard-summary.repository";
import { DashboardSummaryService } from "./dashboard-summary.service";

const ORGANIZATION_ID = "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const PROJECT_ID = "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e";

function serviceWith(overrides: {
  findFirst?: jest.Mock;
  repository?: Partial<Record<keyof DashboardSummaryRepository, jest.Mock>>;
}): DashboardSummaryService {
  const database = {
    project: {
      findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue({ id: PROJECT_ID }),
    },
  } as unknown as PrismaService;

  const repository = {
    countErrorReportsInRange: jest.fn().mockResolvedValue(0),
    countLogRecordsInRange: jest.fn().mockResolvedValue(0),
    countRootSpansInRange: jest.fn().mockResolvedValue(0),
    errorReportCountsByEnvironment: jest.fn().mockResolvedValue([]),
    errorReportCountsByRuntime: jest.fn().mockResolvedValue([]),
    lastErrorReportOccurredAt: jest.fn().mockResolvedValue(null),
    lastLogRecordOccurredAt: jest.fn().mockResolvedValue(null),
    lastRootSpanStartedAt: jest.fn().mockResolvedValue(null),
    ...overrides.repository,
  } as unknown as DashboardSummaryRepository;

  return new DashboardSummaryService(database, repository);
}

describe("DashboardSummaryService.summarize", () => {
  it("rejects a project outside the organization as not found", async () => {
    const service = serviceWith({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(service.summarize(ORGANIZATION_ID, PROJECT_ID)).rejects.toThrow(NotFoundException);
  });

  it("scopes the project lookup to the given organization", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: PROJECT_ID });
    const service = serviceWith({ findFirst });

    await service.summarize(ORGANIZATION_ID, PROJECT_ID);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID, organizationId: ORGANIZATION_ID },
      }),
    );
  });

  it("assembles totals, breakdowns, and a seven-bucket volume series", async () => {
    const service = serviceWith({
      repository: {
        countErrorReportsInRange: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(6)
          .mockResolvedValueOnce(7)
          // The eighth call is the previous-period total, not a bucket.
          .mockResolvedValueOnce(99),
        countLogRecordsInRange: jest.fn().mockResolvedValue(2),
        countRootSpansInRange: jest.fn().mockResolvedValue(9),
        errorReportCountsByEnvironment: jest
          .fn()
          .mockResolvedValue([{ key: "production", count: 4 }]),
        errorReportCountsByRuntime: jest.fn().mockResolvedValue([{ key: "node", count: 4 }]),
        lastErrorReportOccurredAt: jest
          .fn()
          .mockResolvedValue(new Date("2026-09-09T10:00:00.000Z")),
      },
    });

    const summary = await service.summarize(ORGANIZATION_ID, PROJECT_ID);

    expect(summary.errorReports.total).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7);
    expect(summary.errorReports.previousPeriodTotal).toBe(99);
    expect(summary.errorReports.byEnvironment).toEqual({ production: 4 });
    expect(summary.errorReports.byRuntime).toEqual({ node: 4 });
    expect(summary.errorReports.lastOccurredAt).toBe("2026-09-09T10:00:00.000Z");
    expect(summary.logRecords.total).toBe(2 * 7);
    expect(summary.traces.total).toBe(9);
    expect(summary.volumeSeries).toHaveLength(7);
    expect(summary.volumeSeries[6]!.errorReports).toBe(7);
  });
});
