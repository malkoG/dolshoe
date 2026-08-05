import { CopyButton } from "./copy-button";

/**
 * A secret shown once, with the means to take it away.
 *
 * @remarks
 * `min-w-0` is what makes this work inside a dialog. A grid or flex child sizes
 * to its content by default, so an unbroken 90-character token would widen the
 * dialog past the viewport instead of scrolling within it — taking the footer's
 * buttons off-screen with it. Overriding the minimum lets the value scroll in
 * its own box and leaves the dialog the size it asked to be.
 */
function SecretField({
  copyLabel,
  label,
  value,
}: Readonly<{ copyLabel: string; label: string; value: string }>) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{label}</span>
      <code className="block min-w-0 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
        {value}
      </code>
      <CopyButton className="w-fit" label={copyLabel} value={value} />
    </div>
  );
}

export { SecretField };
