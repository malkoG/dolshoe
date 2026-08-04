import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { appConfig } from "../config/app-config";

const logger = getLogger(["dolshoe", "auth", "readiness"]);

/**
 * Says out loud, once per boot, that this instance has an open door.
 *
 * @remarks
 * `MOCK_LOGIN` cannot be set in production — the configuration schema refuses to
 * parse that combination — so this is not the last line of defence. It is here so
 * that an instance somebody left the flag on, and then exposed to a network they
 * did not mean to, says so in its own log rather than only in the `.env` file
 * nobody is reading.
 */
@Injectable()
export class MockLoginReadinessService implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    if (!appConfig.mockLogin) return;

    logger.warn(
      "MOCK_LOGIN is on: anyone who can reach this instance can sign in as any account by typing its login. Development only — unset it before this instance is reachable by anybody else.",
    );
  }
}
