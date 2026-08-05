import { Panel, PanelBar, PanelSummary } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { fetchProjectTokens } from "../lib/projects";
import { useResource } from "../lib/use-resource";
import { ReporterSnippet } from "./reporter-snippet";

/** How often a project with nothing in it looks again for its first event. */
const CHECK_INTERVAL_MS = 5_000;

function Step({
  children,
  number,
  title,
}: Readonly<{ children: ReactNode; number: number; title: ReactNode }>) {
  return (
    <li className="flex gap-4 border-b border-border px-5 py-5 last:border-b-0">
      <span
        aria-hidden="true"
        className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-bold text-muted-foreground"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-bold">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

/**
 * What a project shows before its first event arrives.
 *
 * @remarks
 * A project with nothing in it used to say "once this project's reporters send
 * a failure, it will show up here" and stop there — true, and no help at all to
 * the one person guaranteed to be reading it, who has just created the project
 * and has no reporter sending anything yet. The steps between that screen and a
 * first report lived in the README: issue a token, take the DSN, initialise the
 * reporter. They live here now, in the order they have to happen, on the screen
 * that is already open.
 *
 * It disappears on its own. The panel polls while it is mounted, so the first
 * report replaces these instructions with the list it belongs in rather than
 * waiting for somebody to think of reloading — which is exactly the moment
 * somebody is watching the screen and wondering whether the wiring worked.
 */
export function ProjectSetup({
  checking,
  onCheck,
  orgSlug,
  projectId,
}: Readonly<{
  checking: boolean;
  onCheck: () => void;
  orgSlug: string;
  projectId: string;
}>) {
  const { state } = useResource(
    ({ signal }) => fetchProjectTokens(orgSlug, projectId, { signal }),
    [orgSlug, projectId],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      // A tab nobody is looking at is not waiting for anything, and polling it
      // spends an operator's database on a screen that is not on screen.
      if (document.visibilityState === "hidden") return;
      onCheck();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [onCheck]);

  // A failure to list tokens is not reported here. This panel is instructions,
  // not a token screen: the step below links to the one place that can say
  // anything useful about why, and pushing an error into step one would bury
  // the two steps that still make sense.
  const liveTokens =
    state.status === "ready"
      ? state.data.filter((token) => token.revokedAt == null).length
      : undefined;

  return (
    <Panel>
      <PanelBar>
        <PanelSummary>Set up reporting</PanelSummary>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {checking && <Spinner className="size-3.5" />}
          {checking ? "Checking for events…" : "Watching for the first event"}
        </span>
      </PanelBar>

      <ol>
        <Step
          number={1}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Issue an ingestion token
              {liveTokens != null && liveTokens > 0 && (
                <StatusBadge tone="success">done</StatusBadge>
              )}
            </span>
          }
        >
          <p className="text-[13px] text-muted-foreground">
            {liveTokens == null || liveTokens === 0
              ? "A token is what an application authenticates with, and the DSN it gives you is the only thing the reporter needs. The value is shown once, when it is issued."
              : "This project already has a token. Its DSN was shown once, when it was issued — if nobody kept it, issue another."}
          </p>
          <Button asChild className="mt-3" size="sm" variant="outline">
            <Link params={{ orgSlug, projectId }} to="/orgs/$orgSlug/projects/$projectId/tokens">
              <KeyRound />
              {liveTokens != null && liveTokens > 0 ? "Manage tokens" : "Issue a token"}
            </Link>
          </Button>
        </Step>

        <Step number={2} title="Point your application at it">
          <ReporterSnippet />
        </Step>

        <Step number={3} title="Make it fail once">
          <p className="text-[13px] text-muted-foreground">
            Throw something on purpose — the last line of the snippet will do. This screen is
            watching, and the report will take its place as soon as one arrives.
          </p>
        </Step>
      </ol>
    </Panel>
  );
}
