import { SearchIcon, XIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";

/**
 * A text filter over whatever the panel below is listing.
 *
 * @remarks
 * The clear button only exists while there is something to clear, so the field
 * does not carry a permanently dead control. `label` is visually hidden rather
 * than omitted — the magnifier says "search" to someone who can see it and
 * nothing at all to someone who cannot.
 */
function SearchField({
  className,
  label,
  onValueChange,
  placeholder,
  value,
}: Readonly<{
  className?: string;
  label: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}>) {
  return (
    <label
      data-slot="search-field"
      className={cn(
        "relative flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted pl-3 text-muted-foreground transition-[color,box-shadow] focus-within:border-ring/60 focus-within:bg-card focus-within:ring-[3px] focus-within:ring-ring/20 sm:w-[230px]",
        className,
      )}
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="sr-only">{label}</span>
      <input
        className="min-w-0 flex-1 border-0 bg-transparent py-0 pr-8 text-[11px] text-foreground outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value.length > 0 && (
        <Button
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute right-1.5"
          onClick={() => onValueChange("")}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      )}
    </label>
  );
}

export { SearchField };
