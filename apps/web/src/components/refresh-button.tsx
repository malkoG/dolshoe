import { Button } from "@dolshoe/ui/components/ui/button";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { RefreshCw } from "lucide-react";

/**
 * Asks a list for whatever has arrived since it was opened.
 *
 * @remarks
 * Every list here is a feed of things that happen while you are looking at it,
 * and each one used to be fetched exactly once per navigation. The only way to
 * see a report that landed a minute ago was to reload the whole document, which
 * also threw away the sidebar, the filters, and the scroll position.
 *
 * Icon-only, because it sits in a bar that already spends its width on search
 * and filters, and because a circular arrow is one of the few glyphs that needs
 * no label. It still carries one for anything not reading pictures.
 */
export function RefreshButton({
  label,
  onRefresh,
  refreshing,
}: Readonly<{ label: string; onRefresh: () => void; refreshing: boolean }>) {
  return (
    <Button
      aria-label={label}
      disabled={refreshing}
      onClick={onRefresh}
      size="icon"
      title={label}
      type="button"
      variant="outline"
    >
      {refreshing ? <Spinner /> : <RefreshCw />}
    </Button>
  );
}
