import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";
import { PrismaService } from "../database/prisma.service";
import { IngestReadinessService } from "./ingest-readiness.service";

function setConfig(nodeEnvironment: string, ingestToken: string | undefined): void {
  Object.defineProperty(appConfig, "nodeEnvironment", {
    configurable: true,
    value: nodeEnvironment,
  });
  Object.defineProperty(appConfig, "ingestToken", { configurable: true, value: ingestToken });
}

describe("IngestReadinessService", () => {
  const originalEnvironment = appConfig.nodeEnvironment;
  const originalToken = appConfig.ingestToken;
  let reportedError: jest.SpyInstance;

  beforeEach(() => {
    reportedError = jest
      .spyOn(getLogger(["dolshoe", "ingestion", "readiness"]), "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    setConfig(originalEnvironment, originalToken);
    reportedError.mockRestore();
  });

  it("reports a production instance with no usable credential", async () => {
    setConfig("production", undefined);
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new IngestReadinessService({
      projectToken: { findFirst },
    } as unknown as PrismaService);

    await service.onApplicationBootstrap();

    expect(reportedError).toHaveBeenCalled();
  });

  it("stays quiet when a project token can still authenticate", async () => {
    setConfig("production", undefined);
    const findFirst = jest.fn().mockResolvedValue({ id: "c0ffee00-0000-4000-8000-000000000001" });
    const service = new IngestReadinessService({
      projectToken: { findFirst },
    } as unknown as PrismaService);

    await service.onApplicationBootstrap();

    expect(reportedError).not.toHaveBeenCalled();
  });

  it("does not query at all outside production or when a legacy token is set", async () => {
    const findFirst = jest.fn();
    const database = { projectToken: { findFirst } } as unknown as PrismaService;

    setConfig("development", undefined);
    await new IngestReadinessService(database).onApplicationBootstrap();
    setConfig("production", "0123456789abcdef0123456789abcdef");
    await new IngestReadinessService(database).onApplicationBootstrap();

    expect(findFirst).not.toHaveBeenCalled();
    expect(reportedError).not.toHaveBeenCalled();
  });
});
