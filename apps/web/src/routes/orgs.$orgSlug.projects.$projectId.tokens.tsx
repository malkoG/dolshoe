import { DataState } from "@dolshoe/ui/components/data-state";
import { Panel, PanelBar, PanelControls, PanelSummary } from "@dolshoe/ui/components/panel";
import { SecretField } from "@dolshoe/ui/components/secret-field";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@dolshoe/ui/components/ui/alert-dialog";
import { Button } from "@dolshoe/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dolshoe/ui/components/ui/dialog";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { describeError } from "../lib/api-request";
import { buildProjectDsn } from "../lib/dsn";
import { dateTimeFormatter, pluralize } from "../lib/format";
import { canAdminister } from "../lib/organizations";
import { fetchProjectTokens, issueProjectToken, revokeProjectToken } from "../lib/projects";
import type { IssuedProjectToken, ProjectToken } from "../lib/projects";
import { useResource } from "../lib/use-resource";

export const Route = createFileRoute("/orgs/$orgSlug/projects/$projectId/tokens")({
  component: Tokens,
});

/**
 * The one moment a token is readable.
 *
 * @remarks
 * A modal rather than a panel on the page, which is the point: Dolshoe keeps
 * only a hash, so this is genuinely the last time anyone can read the value.
 * Dismissal is deliberately a single explicit button — no backdrop click, no
 * Escape — so the secret is not lost to a stray keystroke.
 */
function TokenRevealDialog({
  issued,
  onDismiss,
  projectId,
}: Readonly<{ issued: IssuedProjectToken; onDismiss: () => void; projectId: string }>) {
  const dsn = buildProjectDsn(projectId, issued.token);

  return (
    <Dialog onOpenChange={(open) => !open && onDismiss()} open>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Copy this now — it will not be shown again</DialogTitle>
          <DialogDescription>
            Dolshoe stores only a hash of this token, so it cannot show it to you a second time. A
            DSN contains a live credential: treat it like a password.
          </DialogDescription>
        </DialogHeader>

        <SecretField copyLabel="Copy DSN" label="DSN" value={dsn} />
        <p className="text-[11px] text-muted-foreground">
          Pass it as <code className="font-mono">Dolshoe.init(&#123; dsn &#125;)</code>. If your
          applications reach Dolshoe on a different address than this browser does, change the host.
        </p>

        <SecretField copyLabel="Copy token" label="Token" value={issued.token} />

        <DialogFooter>
          <Button onClick={onDismiss} type="button">
            I've stored it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({
  administers,
  onRevoke,
  token,
}: Readonly<{
  administers: boolean;
  onRevoke: (tokenId: string) => Promise<void>;
  token: ProjectToken;
}>) {
  const [revoking, setRevoking] = useState(false);

  async function revoke(): Promise<void> {
    setRevoking(true);
    try {
      await onRevoke(token.id);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <strong className="block truncate text-[13px] font-bold">{token.name}</strong>
        <span className="font-mono text-[10px] text-muted-foreground">dsh_{token.prefix}…</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
        <span>Created {dateTimeFormatter.format(new Date(token.createdAt))}</span>
        <span aria-hidden="true">·</span>
        <span>
          {token.lastUsedAt == null
            ? "Never used"
            : `Last used ${dateTimeFormatter.format(new Date(token.lastUsedAt))}`}
        </span>
      </div>

      {token.revokedAt != null ? (
        <StatusBadge tone="danger">
          Revoked {dateTimeFormatter.format(new Date(token.revokedAt))}
        </StatusBadge>
      ) : (
        administers && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Anything still reporting with this token stops being accepted immediately. This
                  cannot be undone — issue a new token to replace it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction
                  disabled={revoking}
                  onClick={() => void revoke()}
                  variant="destructive"
                >
                  {revoking && <Spinner />}
                  Revoke token
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )
      )}
    </div>
  );
}

function Tokens() {
  const { orgSlug, projectId } = Route.useParams();
  const { organization } = Route.useRouteContext();
  // Issuing and revoking both need the owner or admin role. A member sees the
  // tokens and the wiring instructions, and is not offered two controls the API
  // would answer with a 403 — the same call the projects screen makes about
  // creating a project.
  const administers = canAdminister(organization.role);
  const [name, setName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | undefined>(undefined);
  // Held only here: never stored, never re-fetchable, gone once dismissed.
  const [issued, setIssued] = useState<IssuedProjectToken | undefined>(undefined);

  const { reload, state } = useResource(
    ({ signal }) => fetchProjectTokens(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (issuing || name.trim().length === 0) return;

    setIssuing(true);
    setIssueError(undefined);
    try {
      setIssued(await issueProjectToken(orgSlug, projectId, { name: name.trim() }));
      setName("");
      reload();
    } catch (error) {
      setIssueError(describeError(error, "Something went wrong while issuing the token."));
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(tokenId: string): Promise<void> {
    try {
      await revokeProjectToken(orgSlug, projectId, tokenId);
      reload();
    } catch (error) {
      setIssueError(describeError(error, "Something went wrong while revoking the token."));
    }
  }

  const tokens = state.status === "ready" ? state.data : [];

  return (
    <>
      {issued && (
        <TokenRevealDialog
          issued={issued}
          onDismiss={() => setIssued(undefined)}
          projectId={projectId}
        />
      )}

      <Panel>
        <PanelBar>
          <PanelSummary>
            {state.status === "ready" ? pluralize(tokens.length, "token") : "Tokens"}
          </PanelSummary>

          {administers && (
            <PanelControls>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => void submit(event)}
              >
                <Label className="sr-only" htmlFor="token-name">
                  Token name
                </Label>
                <Input
                  className="w-full sm:w-[230px]"
                  id="token-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Where will it be used?"
                  type="text"
                  value={name}
                />
                <Button disabled={issuing} type="submit">
                  {issuing ? <Spinner /> : <Plus />}
                  Issue token
                </Button>
              </form>
            </PanelControls>
          )}
        </PanelBar>

        {issueError && (
          <p
            className="border-b border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {issueError}
          </p>
        )}

        <div aria-live="polite">
          {state.status === "loading" && (
            <DataState
              kind="loading"
              title="Loading tokens…"
              description="Fetching them from the API."
            />
          )}

          {state.status === "error" && (
            <DataState
              kind="error"
              title="Couldn't load ingestion tokens"
              description={describeError(
                state.error,
                "Something went wrong while loading ingestion tokens.",
              )}
              onRetry={reload}
            />
          )}

          {state.status === "ready" && tokens.length === 0 && (
            <DataState
              kind="empty"
              icon={KeyRound}
              title="No tokens yet"
              description={
                administers
                  ? "Issue one to get the DSN your application reports with."
                  : "An owner or admin of this organization issues these. The DSN one gives them is what an application reports with."
              }
            />
          )}

          {state.status === "ready" &&
            tokens.map((token) => (
              <TokenRow administers={administers} key={token.id} onRevoke={revoke} token={token} />
            ))}
        </div>
      </Panel>
    </>
  );
}
