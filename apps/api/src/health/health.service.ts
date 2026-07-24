import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

export interface HealthResponse {
  status: "ok";
  database: "up";
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly database: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
        database: "down",
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "ok",
      database: "up",
      timestamp: new Date().toISOString(),
    };
  }
}
