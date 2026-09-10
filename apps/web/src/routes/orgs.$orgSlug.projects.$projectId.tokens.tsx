import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { describeError } from "../lib/api-request";
import { buildProjectDsn } from "../lib/dsn";
import { canAdminister } from "../lib/organizations";
import { fetchProjectTokens, issueProjectToken, revokeProjectToken } from "../lib/projects";
import type { IssuedProjectToken, ProjectToken } from "../lib/projects";
import { useResource } from "../lib/use-resource";
import { TokensScreen } from "../screens/tokens/tokens-screen";
import type { IssuedTokenReveal } from "../screens/tokens/tokens-screen";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/tokens")({
  staticData: { breadcrumb: "Tokens" },
  component: Tokens,
});

/**
 * The composition root for project ingestion tokens.
 *
 * @remarks
 * Issuing and revoking both need the owner or admin role. A member sees the
 * tokens and the wiring instructions, and is not offered two controls the API
 * would answer with a 403 — the same call the projects screen makes about
 * creating a project. The plaintext token is held only here: never stored,
 * never re-fetchable, gone once dismissed.
 */
function Tokens() {
  const { orgSlug, projectId } = Route.useParams();
  const { organization } = Route.useRouteContext();
  const administers = canAdminister(organization.role);
  const [name, setName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedTokenReveal | undefined>(undefined);
  const [revokeTarget, setRevokeTarget] = useState<ProjectToken | undefined>(undefined);
  const [revoking, setRevoking] = useState(false);

  const { reload, state } = useResource(
    ({ signal }) => fetchProjectTokens(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  async function issue(): Promise<void> {
    if (issuing || name.trim().length === 0) return;

    setIssuing(true);
    setIssueError(undefined);
    try {
      const created: IssuedProjectToken = await issueProjectToken(orgSlug, projectId, {
        name: name.trim(),
      });
      setIssued({ dsn: buildProjectDsn(projectId, created.token), token: created.token });
      setName("");
      reload();
    } catch (error) {
      setIssueError(describeError(error, "Something went wrong while issuing the token."));
    } finally {
      setIssuing(false);
    }
  }

  async function confirmRevoke(): Promise<void> {
    if (revokeTarget == null) return;

    setRevoking(true);
    try {
      await revokeProjectToken(orgSlug, projectId, revokeTarget.id);
      setRevokeTarget(undefined);
      reload();
    } catch (error) {
      setIssueError(describeError(error, "Something went wrong while revoking the token."));
    } finally {
      setRevoking(false);
    }
  }

  const tokens = state.status === "ready" ? state.data : [];

  return (
    <TokensScreen
      administers={administers}
      errorDescription={
        state.status === "error"
          ? describeError(state.error, "Something went wrong while loading ingestion tokens.")
          : undefined
      }
      issueError={issueError}
      issued={issued}
      issuing={issuing}
      onCancelRevoke={() => setRevokeTarget(undefined)}
      onConfirmRevoke={() => void confirmRevoke()}
      onDismissIssued={() => setIssued(undefined)}
      onIssue={() => void issue()}
      onRequestRevoke={setRevokeTarget}
      onRetry={reload}
      onTokenNameChange={setName}
      revokeTarget={revokeTarget}
      revoking={revoking}
      status={state.status === "ready" ? "ready" : state.status}
      tokenName={name}
      tokens={tokens}
    />
  );
}
