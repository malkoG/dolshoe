import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";

/**
 * Copies a value to the clipboard and says so.
 *
 * @remarks
 * The failure branch is not defensive padding. The Clipboard API is only
 * available on secure origins, which a self-hosted instance served over plain
 * HTTP genuinely is not, so the button tells you to copy by hand rather than
 * appearing to work and silently doing nothing.
 *
 * Once it has failed it stays failed: the origin is not going to become secure
 * while the page is open, and flicking back to "Copy" would only invite another
 * fruitless click.
 */
function CopyButton({
  className,
  label,
  value,
  variant = "outline",
}: Readonly<{
  className?: string;
  label: string;
  value: string;
  variant?: "outline" | "ghost" | "secondary";
}>) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The confirmation outlives the click by two seconds, so it can outlive the
  // component too if the panel holding it is dismissed in between.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Button
      className={className}
      onClick={() => void copy()}
      size="sm"
      type="button"
      variant={variant}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {failed ? "Select and copy manually" : copied ? "Copied" : label}
    </Button>
  );
}

export { CopyButton };
