import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api-request";
import { buildProjectDsn } from "../lib/dsn";
import { dateTimeFormatter } from "../lib/format";
import { fetchProjectTokens, issueProjectToken, revokeProjectToken } from "../lib/projects";
import type { IssuedProjectToken, ProjectToken } from "../lib/projects";

export const Route = createFileRoute("/projects/$projectId/tokens")({ component: Tokens });

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; tokens: ProjectToken[] };

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while loading ingestion tokens.";
}

/**
 * Copies to the clipboard, falling back to selecting the text. The Clipboard API
 * is unavailable on insecure origins, which a self-hosted instance served over
 * plain HTTP genuinely is.
 */
function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button className="copy-button" onClick={() => void copy()} type="button">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {failed ? "Select and copy manually" : copied ? "Copied" : label}
    </button>
  );
}

function TokenReveal({
  issued,
  onDismiss,
  projectId,
}: Readonly<{ issued: IssuedProjectToken; onDismiss: () => void; projectId: string }>) {
  const dsn = buildProjectDsn(projectId, issued.token);
  const dsnRef = useRef<HTMLElement>(null);

  return (
    <div className="token-reveal" role="alert">
      <div className="token-reveal-heading">
        <ShieldAlert size={16} />
        <strong>Copy this now — it will not be shown again</strong>
      </div>
      <p>
        Dolshoe stores only a hash of this token, so it cannot show it to you a second time. A DSN
        contains a live credential: treat it like a password.
      </p>

      <label className="token-field">
        <span>DSN</span>
        <code ref={dsnRef} className="token-value">
          {dsn}
        </code>
        <CopyButton label="Copy DSN" value={dsn} />
      </label>
      <p className="token-hint">
        Pass it as <code>Dolshoe.init(&#123; dsn &#125;)</code>. If your applications reach Dolshoe
        on a different address than this browser does, change the host.
      </p>

      <label className="token-field">
        <span>Token</span>
        <code className="token-value">{issued.token}</code>
        <CopyButton label="Copy token" value={issued.token} />
      </label>

      <button className="primary-button" onClick={onDismiss} type="button">
        I've stored it
      </button>
    </div>
  );
}

function TokenRow({
  onRevoke,
  token,
}: Readonly<{ onRevoke: (tokenId: string) => Promise<void>; token: ProjectToken }>) {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function revoke(): Promise<void> {
    setRevoking(true);
    try {
      await onRevoke(token.id);
    } finally {
      setRevoking(false);
      setConfirming(false);
    }
  }

  return (
    <div className="token-row">
      <div>
        <strong>{token.name}</strong>
        <span className="token-prefix">dsh_{token.prefix}…</span>
      </div>
      <div className="token-meta">
        <span>Created {dateTimeFormatter.format(new Date(token.createdAt))}</span>
        <span className="meta-separator">·</span>
        <span>
          {token.lastUsedAt == null
            ? "Never used"
            : `Last used ${dateTimeFormatter.format(new Date(token.lastUsedAt))}`}
        </span>
      </div>
      {token.revokedAt == null ? (
        confirming ? (
          <span className="token-confirm">
            <button
              className="danger-button"
              disabled={revoking}
              onClick={() => void revoke()}
              type="button"
            >
              {revoking && <Loader2 className="spin" size={12} />}
              Confirm revoke
            </button>
            <button className="ghost-button" onClick={() => setConfirming(false)} type="button">
              Keep
            </button>
          </span>
        ) : (
          <button className="ghost-button" onClick={() => setConfirming(true)} type="button">
            Revoke
          </button>
        )
      ) : (
        <span className="token-badge token-badge-revoked">
          Revoked {dateTimeFormatter.format(new Date(token.revokedAt))}
        </span>
      )}
    </div>
  );
}

function Tokens() {
  const { projectId } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [name, setName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | undefined>(undefined);
  // Held only here: never stored, never re-fetchable, gone once dismissed.
  const [issued, setIssued] = useState<IssuedProjectToken | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading" });

    fetchProjectTokens(projectId, { signal: controller.signal })
      .then((tokens) => {
        if (!cancelled) setState({ status: "ready", tokens });
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, reloadToken]);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (issuing || name.trim().length === 0) return;

    setIssuing(true);
    setIssueError(undefined);
    try {
      setIssued(await issueProjectToken(projectId, { name: name.trim() }));
      setName("");
      setReloadToken((token) => token + 1);
    } catch (error) {
      setIssueError(describeError(error));
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(tokenId: string): Promise<void> {
    try {
      await revokeProjectToken(projectId, tokenId);
      setReloadToken((token) => token + 1);
    } catch (error) {
      setIssueError(describeError(error));
    }
  }

  const tokens = state.status === "ready" ? state.tokens : [];

  return (
    <>
      {issued && (
        <TokenReveal issued={issued} onDismiss={() => setIssued(undefined)} projectId={projectId} />
      )}

      <section className="report-panel">
        <div className="filter-bar">
          <span className="filter-summary">
            {state.status === "ready"
              ? `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}`
              : "Tokens"}
          </span>

          <form className="inline-form" onSubmit={submit}>
            <label className="search-field">
              <span className="sr-only">Token name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="Where will it be used?"
                type="text"
                value={name}
              />
            </label>
            <button className="primary-button" disabled={issuing} type="submit">
              {issuing ? <Loader2 className="spin" size={13} /> : <Plus size={13} />}
              Issue token
            </button>
          </form>
        </div>

        {issueError && (
          <p className="field-error" role="alert">
            {issueError}
          </p>
        )}

        <div className="project-list" aria-live="polite">
          {state.status === "loading" && (
            <div className="state-panel state-panel-loading" role="status">
              <span className="state-icon">
                <Loader2 className="spin" size={19} />
              </span>
              <strong>Loading tokens…</strong>
              <p>Fetching them from the API.</p>
            </div>
          )}

          {state.status === "error" && (
            <div className="state-panel state-panel-error" role="alert">
              <span className="state-icon">
                <AlertTriangle size={19} />
              </span>
              <strong>Couldn't load ingestion tokens</strong>
              <p>{describeError(state.error)}</p>
              <button onClick={() => setReloadToken((token) => token + 1)} type="button">
                <RefreshCw size={13} />
                Try again
              </button>
            </div>
          )}

          {state.status === "ready" && tokens.length === 0 && (
            <div className="state-panel">
              <span className="state-icon">
                <KeyRound size={19} />
              </span>
              <strong>No tokens yet</strong>
              <p>Issue one to get the DSN your application reports with.</p>
            </div>
          )}

          {state.status === "ready" &&
            tokens.map((token) => <TokenRow key={token.id} onRevoke={revoke} token={token} />)}
        </div>
      </section>
    </>
  );
}
