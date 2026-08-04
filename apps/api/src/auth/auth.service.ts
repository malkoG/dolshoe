import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

import { PrismaService } from "../database/prisma.service";
import { LoginRequest, RegisterRequest, Viewer } from "./auth.contract";
import { ABSENT_PASSWORD_HASH, hashPassword, isPasswordHash, verifyPassword } from "./password";

/**
 * Serializes instance claims. Two registrations arriving together would
 * otherwise both observe an unclaimed instance and both succeed, leaving an
 * instance with an owner nobody intended.
 */
const INSTANCE_CLAIM_LOCK = "dolshoe.instance-claim";

const logger = getLogger(["dolshoe", "auth"]);

interface UserRow {
  id: string;
  email: string;
  name: string;
}

function toViewer(row: UserRow): Viewer {
  return { id: row.id, email: row.email, name: row.name };
}

@Injectable()
export class AuthService {
  constructor(private readonly database: PrismaService) {}

  async isInstanceClaimed(): Promise<boolean> {
    const existing = await this.database.user.findFirst({ select: { id: true } });
    return existing != null;
  }

  /**
   * Creates the first account on an instance that has none.
   *
   * @remarks
   * Registration is open exactly once. A fresh instance has no account to invite
   * anyone, and a migration cannot invent a credential, so the first person to
   * reach it claims it; everyone after that arrives by invitation. This is why
   * an instance must be claimed as soon as it is reachable, and why the API
   * warns at startup while it is not.
   */
  async register(request: RegisterRequest): Promise<Viewer> {
    const passwordHash = await hashPassword(request.password);

    return this.database.$transaction(async (transaction) => {
      // Taken before the count so the check and the insert are one decision.
      // Released when the transaction ends, whichever way it ends.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${INSTANCE_CLAIM_LOCK}))`;

      const existing = await transaction.user.findFirst({ select: { id: true } });
      if (existing != null) {
        throw new ConflictException(
          "This instance has already been claimed. Ask an owner for an invitation.",
        );
      }

      const created = await transaction.user.create({
        data: { email: request.email, name: request.name, passwordHash },
        select: { id: true, email: true, name: true },
      });

      logger.info("Instance claimed by {email}.", { email: created.email });

      return toViewer(created);
    });
  }

  /**
   * Verifies a sign-in.
   *
   * @remarks
   * The failure message never distinguishes an unknown address from a wrong
   * password, and an unknown address is still compared against a stand-in hash,
   * so neither the wording nor the timing says whether an account exists.
   */
  async authenticate(request: LoginRequest): Promise<Viewer> {
    const stored = await this.database.user.findUnique({
      where: { email: request.email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    const matches = await verifyPassword(
      request.password,
      stored?.passwordHash ?? ABSENT_PASSWORD_HASH,
    );

    if (stored != null && !isPasswordHash(stored.passwordHash)) {
      // Not a wrong password: the stored value is not something this application
      // wrote. Reported so it is fixable, rather than presenting for ever as a
      // person who keeps mistyping.
      logger.error("Stored password hash for {userId} is unreadable.", { userId: stored.id });
    }

    if (stored == null || !matches) {
      throw new UnauthorizedException("That email and password do not match an account.");
    }

    return toViewer(stored);
  }
}
