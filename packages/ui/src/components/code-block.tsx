import { cn } from "../lib/utils";
import { CopyButton } from "./copy-button";

/**
 * A snippet written to be pasted into somebody else's editor.
 *
 * @remarks
 * Deliberately shaped like {@link SecretField}, because a reader meets the two
 * of them side by side while wiring an application up, and a snippet that
 * framed itself differently would read as a different kind of thing.
 *
 * The copy button is the point rather than a convenience: nobody retypes an
 * import and an init block correctly, and a snippet that has to be selected by
 * hand tends to arrive with half a line missing.
 */
function CodeBlock({
  className,
  copyLabel = "Copy snippet",
  label,
  value,
}: Readonly<{ className?: string; copyLabel?: string; label?: string; value: string }>) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {label != null && (
        <span className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
          {label}
        </span>
      )}
      {/*
        `min-w-0` for the same reason the secret field needs it: a long line
        must scroll inside this box rather than widen whatever is holding it.
      */}
      <pre className="min-w-0 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-[11px] leading-[1.75]">
        <code>{value}</code>
      </pre>
      <CopyButton className="w-fit" label={copyLabel} value={value} />
    </div>
  );
}

export { CodeBlock };
