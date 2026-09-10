import { CodeBlock } from "@dolshoe/ui/components/code-block";
import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";

import { REPORTS_SETUP_SNIPPET } from "./reports-setup-snippet";

export { REPORTS_SETUP_SNIPPET };

function Step({
  children,
  number,
  title,
}: Readonly<{ children: ReactNode; number: number; title: ReactNode }>) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-mono text-foreground"
      >
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-body font-semibold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export interface ReportsSetupProps {
  checking: boolean;
  hasLiveToken: boolean;
  snippet: string;
  tokenHref: string;
}

/**
 * What a project shows before its first report arrives.
 *
 * @remarks
 * A private stub of the Figma ProjectSetup panel. Polling and the token
 * listing stay in the route; this view only paints the values it is given.
 * `hasLiveToken` is the one extra beat the live screen can reach that the
 * board does not draw — the step still has to say when a token already exists.
 */
export function ReportsSetup({
  checking,
  hasLiveToken,
  snippet,
  tokenHref,
}: Readonly<ReportsSetupProps>) {
  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Set up reporting</PanelSummary>
        <span className="flex items-center gap-2 text-meta text-muted-foreground">
          {checking && <Spinner className="size-3.5" />}
          {checking ? "Checking for events…" : "Watching for the first event"}
        </span>
      </PanelBar>

      <ol className="flex flex-col gap-6 p-6">
        <Step
          number={1}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Issue an ingestion token
              {hasLiveToken && <StatusBadge tone="success">done</StatusBadge>}
            </span>
          }
        >
          <p className="text-body text-muted-foreground">
            {hasLiveToken
              ? "This project already has a token. Its DSN was shown once, when it was issued — if nobody kept it, issue another."
              : "A token is what an application authenticates with, and the DSN it gives you is the only thing the reporter needs. The value is shown once, when it is issued."}
          </p>
          <Button asChild className="w-fit" size="sm" variant="outline">
            <a href={tokenHref}>
              <KeyRound className="size-3.5" />
              {hasLiveToken ? "Manage tokens" : "Issue a token"}
            </a>
          </Button>
        </Step>

        <Step number={2} title="Point your application at it">
          <p className="text-body text-muted-foreground">
            Put the DSN in <code className="font-mono text-mono">DOLSHOE_DSN</code>, then initialise
            the reporter once, as early in start-up as you can.
          </p>
          <CodeBlock value={snippet} />
        </Step>

        <Step number={3} title="Make it fail once">
          <p className="text-body text-muted-foreground">
            Throw something on purpose — the last line of the snippet will do. This screen is
            watching, and the report will take its place as soon as one arrives.
          </p>
        </Step>
      </ol>
    </Panel>
  );
}
