import { cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/utils";

export type FrameOrigin = "app" | "dependency" | "runtime";

export interface StackTraceFrame {
  functionName?: string | undefined;
  moduleName?: string | undefined;
  fileName?: string | undefined;
  lineNumber?: number | undefined;
  columnNumber?: number | undefined;
  sourceLine?: string | undefined;
  preContext?: readonly string[] | undefined;
  postContext?: readonly string[] | undefined;
  inApp?: boolean | undefined;
  origin?: FrameOrigin | undefined;
  native?: boolean | undefined;
  async?: boolean | undefined;
}

/** Specifiers for a runtime's own internals, the same set the reporters classify by. */
const runtimePrefixes = ["node:", "bun:", "ext:", "deno:"];

/**
 * Which world a frame came from, for a report that may predate `origin`.
 *
 * @remarks
 * The fallback reads the file name rather than trusting `inApp` alone. A report
 * stored before `origin` existed says only "not the application" about a
 * `node:internal/…` frame, and filing that under dependencies would put the
 * runtime's own internals in a group labelled after somebody's library. The
 * specifier is still there to be read, so it is.
 */
export function frameOrigin(frame: StackTraceFrame): FrameOrigin {
  if (frame.origin !== undefined) return frame.origin;
  if (frame.native === true) return "runtime";
  if (frame.fileName != null && runtimePrefixes.some((p) => frame.fileName?.startsWith(p))) {
    return "runtime";
  }
  return frame.inApp === false ? "dependency" : "app";
}

/** The package a dependency frame belongs to, when its specifier says so. */
export function packageOf(fileName: string | undefined): string | undefined {
  if (fileName == null) return undefined;

  const modules = fileName.lastIndexOf("node_modules/");
  const sitePackages = /(?:site|dist)-packages\//.exec(fileName);
  let rest: string | undefined;

  if (modules >= 0) {
    rest = fileName.slice(modules + "node_modules/".length);
  } else if (sitePackages != null) {
    rest = fileName.slice(sitePackages.index + sitePackages[0].length);
  } else if (/^(?:jsr|npm):/.test(fileName)) {
    rest = fileName.slice(fileName.indexOf(":") + 1);
  }
  if (rest == null) return undefined;

  const segments = rest.split("/");
  const name = rest.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  // `npm:express@4.19.2` and `jsr:@std/assert@1.0.0` both pin a version the
  // reader does not need in a heading.
  return (
    name
      ?.split("@")
      .slice(0, name.startsWith("@") ? 2 : 1)
      .join("@") || undefined
  );
}

export interface FrameGroup {
  origin: FrameOrigin;
  /** What to call this run: "Your code", a package name, "Libraries", "Runtime". */
  label: string;
  frames: StackTraceFrame[];
  /** Index of the first frame, which is also a stable key for the run. */
  offset: number;
}

function labelFor(origin: FrameOrigin, frames: readonly StackTraceFrame[]): string {
  if (origin === "app") return "Your code";
  if (origin === "runtime") return "Runtime";

  const packages = new Set(frames.map((frame) => packageOf(frame.fileName)));
  const [only] = packages;
  return packages.size === 1 && only !== undefined ? only : "Libraries";
}

/**
 * Fold each run of consecutive same-origin frames into one group.
 *
 * @remarks
 * By origin, not by "is it ours" — a run of dependency frames and the runtime
 * frames underneath it are two different answers to "who was executing", and
 * collapsing them together throws away the distinction `origin` exists to draw.
 * Runs rather than totals, because the order is the call chain: `express`
 * appearing above the runtime and again below it is two visits, and reading it
 * as one would misdescribe what happened.
 */
export function groupFrames(frames: readonly StackTraceFrame[]): FrameGroup[] {
  const groups: FrameGroup[] = [];

  for (const [index, frame] of frames.entries()) {
    const origin = frameOrigin(frame);
    const current = groups.at(-1);

    if (current != null && current.origin === origin) {
      current.frames.push(frame);
      current.label = labelFor(origin, current.frames);
    } else {
      groups.push({ origin, label: labelFor(origin, [frame]), frames: [frame], offset: index });
    }
  }

  return groups;
}

function formatLocation(frame: StackTraceFrame): string | undefined {
  if (frame.fileName == null) return frame.native === true ? "native code" : undefined;
  if (frame.lineNumber == null) return frame.fileName;
  return frame.columnNumber == null
    ? `${frame.fileName}:${frame.lineNumber}`
    : `${frame.fileName}:${frame.lineNumber}:${frame.columnNumber}`;
}

const frameRowVariants = cva("border-l-2 px-5 py-2.5", {
  variants: {
    origin: {
      app: "border-l-brand bg-card",
      dependency: "border-l-border bg-card",
      runtime: "border-l-transparent bg-card",
    },
  },
  defaultVariants: {
    origin: "app",
  },
});

function StackFrameRow({ frame }: Readonly<{ frame: StackTraceFrame }>) {
  const origin = frameOrigin(frame);
  const location = formatLocation(frame);

  return (
    <li className={cn(frameRowVariants({ origin }))} data-origin={origin}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "text-[13px] font-bold",
            origin === "app" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {frame.functionName ?? "(anonymous)"}
        </span>
        {frame.async === true && (
          <span className="font-mono text-[9px] tracking-[0.06em] text-faint uppercase">async</span>
        )}
        {frame.moduleName != null && (
          <span className="font-mono text-[10px] text-faint">{frame.moduleName}</span>
        )}
      </div>

      {location != null && (
        <div className="mt-0.5 font-mono text-[10px] break-all text-muted-foreground">
          {location}
        </div>
      )}

      <SourceContext frame={frame} />
    </li>
  );
}

interface ContextLine {
  number: number | undefined;
  text: string;
  failing: boolean;
}

/**
 * The failing line, in the lines around it.
 *
 * @remarks
 * Numbered from the frame's own `lineNumber` counting back through
 * `preContext`, which is what makes the block matchable against the file open
 * in an editor. When the frame has no line number the gutter is left blank
 * rather than invented — a wrong number is worse than none, because it is the
 * one part of this a reader will act on without checking.
 */
function SourceContext({ frame }: Readonly<{ frame: StackTraceFrame }>) {
  const { preContext = [], postContext = [], sourceLine } = frame;
  if (sourceLine == null && preContext.length === 0 && postContext.length === 0) return null;

  const first =
    frame.lineNumber == null ? undefined : Math.max(1, frame.lineNumber - preContext.length);
  const numberAt = (offset: number) => (first == null ? undefined : first + offset);

  const lines: ContextLine[] = [
    ...preContext.map((text, index) => ({ number: numberAt(index), text, failing: false })),
    ...(sourceLine == null ? [] : [{ number: frame.lineNumber, text: sourceLine, failing: true }]),
    ...postContext.map((text, index) => ({
      number: numberAt(preContext.length + (sourceLine == null ? 0 : 1) + index),
      text,
      failing: false,
    })),
  ];

  return (
    <pre className="mt-1.5 overflow-x-auto rounded-md bg-secondary py-1.5 font-mono text-[11px]">
      <code>
        {lines.map((line, index) => (
          <span
            className={cn(
              "flex gap-3 px-2.5",
              line.failing ? "bg-brand-soft font-bold text-foreground" : "text-muted-foreground",
            )}
            key={index}
          >
            <span aria-hidden="true" className="w-8 shrink-0 text-right text-faint select-none">
              {line.number ?? ""}
            </span>
            <span className="whitespace-pre">{line.text}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

/**
 * One run of frames, innermost first.
 *
 * @remarks
 * Which run is on screen is the aside's business, not this component's. It
 * renders what it is given and nothing else, which is what lets the same list
 * serve a selected group here and a whole exception elsewhere.
 */
function StackTrace({
  frames,
  className,
  ...props
}: React.ComponentProps<"ol"> & { frames: readonly StackTraceFrame[] }) {
  return (
    <ol className={cn("divide-y divide-border", className)} data-slot="stack-trace" {...props}>
      {frames.map((frame, index) => (
        <StackFrameRow frame={frame} key={index} />
      ))}
    </ol>
  );
}

export { StackTrace };
