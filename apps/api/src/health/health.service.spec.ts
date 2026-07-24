import { ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports that the application and database are healthy", async () => {
    const database = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const service = new HealthService(database);

    await expect(service.check()).resolves.toMatchObject({
      status: "ok",
      database: "up",
    });
  });

  it("reports an unavailable service when the database cannot be reached", async () => {
    const database = {
      ping: jest.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as PrismaService;
    const service = new HealthService(database);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
