import type { ProjectToken } from "../../lib/projects";
import type { TokensChrome } from "./tokens-chrome";
import type { TokensScreenProps } from "./tokens-screen";

/**
 * Named states for Figma 27 — Project · Tokens.
 *
 * @remarks
 * The three frames on that page are the silhouettes: the populated list, the
 * one-time DSN reveal, and the revoke confirmation. Loading and empty exist
 * on the live route but do not change the Figma silhouette, so they are not
 * factories here.
 */
const FIGMA_CHROME: TokensChrome = {
  orgName: "Acme Payments",
  projectName: "checkout-api",
  viewerName: "Koding Warrior",
  viewerHandle: "@kodingwarrior",
};

const checkoutApi: ProjectToken = {
  id: "tok_checkout",
  name: "checkout-api · production",
  prefix: "a7f3k2",
  createdAt: "2026-09-02T10:14:00.000Z",
  lastUsedAt: "2026-09-10T13:02:00.000Z",
  revokedAt: null,
};

const paymentsWorker: ProjectToken = {
  id: "tok_worker",
  name: "payments worker",
  prefix: "q9m2x7",
  createdAt: "2026-08-21T16:40:00.000Z",
  lastUsedAt: "2026-09-10T12:58:00.000Z",
  revokedAt: null,
};

const localDev: ProjectToken = {
  id: "tok_local",
  name: "local dev (mina)",
  prefix: "z3p8v1",
  createdAt: "2026-08-14T09:02:00.000Z",
  lastUsedAt: null,
  revokedAt: "2026-09-03T11:20:00.000Z",
};

const POPULATED_TOKENS = [checkoutApi, paymentsWorker, localDev];

function idleHandlers(): Pick<
  TokensScreenProps,
  | "onCancelRevoke"
  | "onConfirmRevoke"
  | "onDismissIssued"
  | "onIssue"
  | "onRequestRevoke"
  | "onTokenNameChange"
> {
  return {
    onCancelRevoke: () => undefined,
    onConfirmRevoke: () => undefined,
    onDismissIssued: () => undefined,
    onIssue: () => undefined,
    onRequestRevoke: () => undefined,
    onTokenNameChange: () => undefined,
  };
}

function populated(): TokensScreenProps {
  return {
    ...idleHandlers(),
    administers: true,
    chrome: FIGMA_CHROME,
    issuing: false,
    status: "ready",
    tokenName: "",
    tokens: POPULATED_TOKENS,
  };
}

function reveal(): TokensScreenProps {
  return {
    ...populated(),
    issued: {
      dsn: "https://dsh_a7f3k2x9LmN4pRt7vWy2bcd6eFg8hJk@dolshoe.example.com/ingest/8cl1",
      token: "dsh_a7f3k2x9LmN4pRt7vWy2bcd6eFg8hJk",
    },
  };
}

function revoke(): TokensScreenProps {
  return {
    ...populated(),
    revokeTarget: checkoutApi,
  };
}

export const tokensScreenStates = {
  populated,
  reveal,
  revoke,
} as const;

export const tokensScreenStateNames = ["populated", "reveal", "revoke"] as const;

export type TokensScreenStateName = (typeof tokensScreenStateNames)[number];

export function isTokensScreenStateName(value: string | null): value is TokensScreenStateName {
  return value != null && (tokensScreenStateNames as readonly string[]).includes(value);
}
