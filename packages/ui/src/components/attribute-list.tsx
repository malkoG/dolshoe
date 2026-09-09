import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const pillBackgroundVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border px-2 py-1 font-mono text-[10px]",
  {
    variants: {
      background: {
        card: "bg-card",
        muted: "bg-muted",
      },
    },
    defaultVariants: {
      background: "muted",
    },
  },
);

/**
 * A wrapped row of key:value pills for an arbitrary attribute bag.
 *
 * @remarks
 * Promoted out of two call sites — a trace's span attributes and a log
 * record's — that had built the identical pill byte-for-byte independently.
 * `background` exists because a pill needs to contrast with whatever it sits
 * on: the trace screen nests these inside an already-muted `<dl>`, so its
 * pills read against `bg-card`; the log screen's rows are plain, so `bg-muted`
 * is the one that shows up there. Neither is more "correct" — pick whichever
 * actually contrasts with the pill's container.
 */
function AttributeList({
  entries,
  background = "muted",
  className,
}: {
  entries: ReadonlyArray<readonly [string, string]>;
  background?: VariantProps<typeof pillBackgroundVariants>["background"];
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      {entries.map(([key, value]) => (
        <span className={pillBackgroundVariants({ background })} key={key}>
          <span className="text-faint">{key}</span>
          {value}
        </span>
      ))}
    </div>
  );
}

/**
 * Turns an arbitrary JSON-ish attribute bag into the `[key, value]` pairs
 * `AttributeList` renders, stringifying anything that isn't already a string.
 */
function attributeEntries(
  attributes: Readonly<Record<string, unknown>> | null | undefined,
): Array<[string, string]> {
  if (attributes == null) return [];
  return Object.entries(attributes).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

export { AttributeList, attributeEntries };
