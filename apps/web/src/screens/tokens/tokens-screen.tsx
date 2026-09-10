import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRowLink, ListRowMain, ListRowMeta } from "@dolshoe/ui/components/list-row";
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
import { KeyRound, Plus } from "lucide-react";

import { ReporterSnippet } from "../../components/reporter-snippet";
import { dateTimeFormatter, pluralize } from "../../lib/format";
import type { ProjectToken } from "../../lib/projects";
import { TokensChrome } from "./tokens-chrome";
import type { TokensChrome as TokensChromeProps } from "./tokens-chrome";

export type TokensLoadStatus = "loading" | "error" | "ready";

export interface IssuedTokenReveal {
  dsn: string;
  token: string;
}

/**
 * Values the Tokens public view paints.
 *
 * @remarks
 * The route is the composition root that fetches, issues, and revokes. A
 * construction test and a silhouette inject a named state instead. Chrome is
 * optional: the live page already sits in PageShell, so only the silhouette
 * factories pass the private stubs that match Figma 27.
 */
export interface TokensScreenProps {
  administers: boolean;
  chrome?: TokensChromeProps;
  errorDescription?: string;
  issueError?: string;
  issued?: IssuedTokenReveal;
  issuing: boolean;
  onCancelRevoke?: () => void;
  onConfirmRevoke?: () => void;
  onDismissIssued?: () => void;
  onIssue?: () => void;
  onRequestRevoke?: (token: ProjectToken) => void;
  onRetry?: () => void;
  onTokenNameChange?: (value: string) => void;
  revokeTarget?: ProjectToken;
  revoking?: boolean;
  status: TokensLoadStatus;
  tokenName: string;
  tokens: readonly ProjectToken[];
}

function TokenRow({
  administers,
  onRequestRevoke,
  token,
}: Readonly<{
  administers: boolean;
  onRequestRevoke?: (token: ProjectToken) => void;
  token: ProjectToken;
}>) {
  return (
    <ListRowLink>
      <ListRowMain className="flex min-w-60 flex-col gap-1">
        <strong className="block truncate text-sm font-semibold">{token.name}</strong>
        <span className="font-mono text-xs text-muted-foreground">dsh_{token.prefix}…</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>Created {dateTimeFormatter.format(new Date(token.createdAt))}</span>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
          <span>
            {token.lastUsedAt == null
              ? "Never used"
              : `Last used ${dateTimeFormatter.format(new Date(token.lastUsedAt))}`}
          </span>
        </span>
      </ListRowMain>

      <ListRowMeta>
        {token.revokedAt != null ? (
          <StatusBadge tone="danger">
            Revoked {dateTimeFormatter.format(new Date(token.revokedAt))}
          </StatusBadge>
        ) : (
          administers && (
            <Button
              onClick={() => onRequestRevoke?.(token)}
              size="sm"
              type="button"
              variant="outline"
            >
              Revoke
            </Button>
          )
        )}
      </ListRowMeta>
    </ListRowLink>
  );
}

function TokenRevealDialog({
  issued,
  onDismiss,
}: Readonly<{ issued: IssuedTokenReveal; onDismiss?: () => void }>) {
  return (
    <Dialog onOpenChange={(open) => !open && onDismiss?.()} open>
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

        <SecretField copyLabel="Copy DSN" label="DSN" value={issued.dsn} />
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

function TokenRevokeDialog({
  onCancel,
  onConfirm,
  revoking = false,
  token,
}: Readonly<{
  onCancel?: () => void;
  onConfirm?: () => void;
  revoking?: boolean;
  token: ProjectToken;
}>) {
  return (
    <AlertDialog onOpenChange={(open) => !open && onCancel?.()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything still reporting with this token stops being accepted immediately. This cannot
            be undone — issue a new token to replace it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction disabled={revoking} onClick={onConfirm} variant="destructive">
            {revoking && <Spinner />}
            Revoke token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TokensContent({
  administers,
  errorDescription,
  issueError,
  issuing,
  onIssue,
  onRequestRevoke,
  onRetry,
  onTokenNameChange,
  status,
  tokenName,
  tokens,
}: Readonly<
  Pick<
    TokensScreenProps,
    | "administers"
    | "errorDescription"
    | "issueError"
    | "issuing"
    | "onIssue"
    | "onRequestRevoke"
    | "onRetry"
    | "onTokenNameChange"
    | "status"
    | "tokenName"
    | "tokens"
  >
>) {
  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (issuing || tokenName.trim().length === 0) return;
    onIssue?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelBar>
          <PanelSummary>
            {status === "ready" ? pluralize(tokens.length, "token") : "Tokens"}
          </PanelSummary>

          {administers && (
            <PanelControls>
              <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
                <Label className="sr-only" htmlFor="token-name">
                  Token name
                </Label>
                <Input
                  className="h-8 w-full sm:w-[230px]"
                  id="token-name"
                  onChange={(event) => onTokenNameChange?.(event.target.value)}
                  placeholder="Where will it be used?"
                  type="text"
                  value={tokenName}
                />
                <Button disabled={issuing} size="sm" type="submit">
                  {issuing ? <Spinner /> : <Plus className="size-3.5" />}
                  Issue token
                </Button>
              </form>
            </PanelControls>
          )}
        </PanelBar>

        {issueError != null && issueError.length > 0 && (
          <p
            className="border-b border-border bg-brand-soft px-5 py-3 text-[11px] font-semibold text-brand"
            role="alert"
          >
            {issueError}
          </p>
        )}

        <div aria-live="polite">
          {status === "loading" && (
            <DataState
              kind="loading"
              title="Loading tokens…"
              description="Fetching them from the API."
            />
          )}

          {status === "error" && (
            <DataState
              kind="error"
              title="Couldn't load ingestion tokens"
              description={
                errorDescription ?? "Something went wrong while loading ingestion tokens."
              }
              onRetry={onRetry}
            />
          )}

          {status === "ready" && tokens.length === 0 && (
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

          {status === "ready" &&
            tokens.map((token) => (
              <TokenRow
                administers={administers}
                key={token.id}
                onRequestRevoke={onRequestRevoke}
                token={token}
              />
            ))}
        </div>
      </Panel>

      <Panel>
        <PanelBar>
          <PanelSummary>Reporting from your application</PanelSummary>
        </PanelBar>
        <div className="p-5">
          <ReporterSnippet />
        </div>
      </Panel>
    </div>
  );
}

/**
 * Project ingestion tokens: the list, the one-time reveal, and the revoke
 * confirmation.
 */
export function TokensScreen({
  chrome,
  issued,
  onCancelRevoke,
  onConfirmRevoke,
  onDismissIssued,
  onRequestRevoke,
  revokeTarget,
  revoking,
  ...content
}: Readonly<TokensScreenProps>) {
  const body = <TokensContent {...content} onRequestRevoke={onRequestRevoke} />;

  return (
    <>
      {issued != null && <TokenRevealDialog issued={issued} onDismiss={onDismissIssued} />}
      {revokeTarget != null && (
        <TokenRevokeDialog
          onCancel={onCancelRevoke}
          onConfirm={onConfirmRevoke}
          revoking={revoking}
          token={revokeTarget}
        />
      )}

      {chrome == null ? body : <TokensChrome chrome={chrome}>{body}</TokensChrome>}
    </>
  );
}
