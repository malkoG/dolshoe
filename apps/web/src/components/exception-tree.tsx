import { CopyButton } from "@dolshoe/ui/components/copy-button";
import { StackTrace, groupFrames } from "@dolshoe/ui/components/stack-trace";
import type { FrameGroup } from "@dolshoe/ui/components/stack-trace";
import {
  TraceAside,
  TraceAsideItem,
  TraceAsideSection,
  TraceContent,
  TraceExplorer,
} from "@dolshoe/ui/components/trace-explorer";
import { useMemo, useState } from "react";

import type { NormalizedException } from "../lib/error-reports";

/** Why an exception is in the chain, given the one that introduced it. */
type Relation = "cause" | "context" | "member";

const RELATION_LABELS: Record<Relation, string> = {
  cause: "Caused by",
  context: "Raised while handling",
  member: "Grouped exception",
};

interface ChainEntry {
  exception: NormalizedException;
  relation?: Relation;
  groups: FrameGroup[];
  /** Stable across renders because it is the walk order, which is deterministic. */
  key: string;
}

/**
 * Flatten the exception tree into the order it should be read in.
 *
 * @remarks
 * `cause`, `context` and `children` are each a whole exception with its own
 * frames, up to sixteen deep. They are laid out flat rather than nested because
 * the aside is a list: sixteen levels of indentation in a 260px rail would push
 * the innermost failure — very often the one that matters — out of sight, and
 * the relation label already says how each entry got here.
 */
function flattenChain(
  exception: NormalizedException,
  relation: Relation | undefined,
  key: string,
  into: ChainEntry[],
): void {
  into.push({ exception, relation, key, groups: groupFrames(exception.frames ?? []) });

  if (exception.cause != null) {
    flattenChain(exception.cause, "cause", `${key}.cause`, into);
  }
  if (exception.context != null) {
    flattenChain(exception.context, "context", `${key}.context`, into);
  }
  for (const [index, child] of (exception.children ?? []).entries()) {
    flattenChain(child, "member", `${key}.child${index}`, into);
  }
}

/**
 * What to call an exception in a heading.
 *
 * @remarks
 * A thrown non-exception has no `type` but is not unknown: the reporter recorded
 * what it was. Falling straight through to "Unknown exception" would throw that
 * away and label a perfectly well-described string as a mystery.
 */
function describeException(exception: NormalizedException): string {
  if (exception.type != null) return exception.type;
  if (exception.value != null) return `Thrown ${exception.value.type}`;
  return "Unknown exception";
}

function ExceptionHeader({ exception }: Readonly<{ exception: NormalizedException }>) {
  const { value } = exception;

  return (
    <header className="border-b border-border px-5 py-4">
      <h2 className="text-[15px] font-bold">{describeException(exception)}</h2>
      {exception.message != null && exception.message.length > 0 && (
        <p className="mt-1 text-[13px] text-muted-foreground">{exception.message}</p>
      )}
      {exception.code != null && (
        <p className="mt-1 font-mono text-[10px] text-faint">code {exception.code}</p>
      )}
      {value != null && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          A {value.type} was thrown: {value.representation ?? "(no representation)"}
        </p>
      )}
    </header>
  );
}

function RawStacktrace({ text }: Readonly<{ text: string }>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <button
          aria-expanded={open}
          className="font-mono text-[10px] text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          type="button"
        >
          {open ? "Hide raw stack trace" : "Show raw stack trace"}
        </button>
        {open && <CopyButton label="Copy raw stack trace" value={text} variant="ghost" />}
      </div>

      {open && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-secondary p-3 font-mono text-[11px] text-muted-foreground">
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}

/**
 * The whole stored exception, read one run of frames at a time.
 *
 * @remarks
 * The selection opens on the first run of application frames anywhere in the
 * chain rather than on the outermost exception. A wrapped failure puts the
 * application's own code inside the `cause`, so opening at the top would show a
 * reader the framework that rethrew and nothing they wrote.
 */
export function ExceptionTree({ exception }: Readonly<{ exception: NormalizedException }>) {
  const chain = useMemo(() => {
    const entries: ChainEntry[] = [];
    flattenChain(exception, undefined, "root", entries);
    return entries;
  }, [exception]);

  const firstSelectable = useMemo(() => {
    const withApp = chain.find((entry) => entry.groups.some((group) => group.origin === "app"));
    const entry = withApp ?? chain.find((candidate) => candidate.groups.length > 0) ?? chain[0];
    const group = entry?.groups.find((candidate) => candidate.origin === "app") ?? entry?.groups[0];
    return `${entry?.key ?? "root"}#${group?.offset ?? 0}`;
  }, [chain]);

  const [selected, setSelected] = useState(firstSelectable);

  const active = chain.find((entry) => selected.startsWith(`${entry.key}#`)) ?? chain[0];
  const activeGroup =
    active?.groups.find((group) => selected.endsWith(`#${group.offset}`)) ?? active?.groups[0];

  return (
    <TraceExplorer>
      <TraceAside aria-label="Exceptions and stack frames">
        {chain.map((entry) => (
          <TraceAsideSection
            key={entry.key}
            relation={entry.relation == null ? undefined : RELATION_LABELS[entry.relation]}
            title={describeException(entry.exception)}
          >
            {entry.groups.length === 0 ? (
              <li className="px-2 py-1 font-mono text-[10px] text-faint">No frames</li>
            ) : (
              entry.groups.map((group) => (
                <TraceAsideItem
                  count={group.frames.length}
                  key={group.offset}
                  onClick={() => setSelected(`${entry.key}#${group.offset}`)}
                  selected={entry === active && group === activeGroup}
                >
                  {group.label}
                </TraceAsideItem>
              ))
            )}
          </TraceAsideSection>
        ))}
      </TraceAside>

      <TraceContent>
        {active != null && (
          <>
            <ExceptionHeader exception={active.exception} />
            {activeGroup == null ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">
                This exception was stored without any stack frames.
              </p>
            ) : (
              <StackTrace frames={activeGroup.frames} />
            )}
            {active.exception.stacktrace != null && (
              <RawStacktrace text={active.exception.stacktrace} />
            )}
          </>
        )}
      </TraceContent>
    </TraceExplorer>
  );
}
