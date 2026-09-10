import { cn } from "@dolshoe/ui/lib/utils";

/**
 * A two- or three-way choice that sits in a panel bar: density, a chart range.
 *
 * @remarks
 * The track is inset and the selected option lifts onto the card so the
 * choice reads as a switch, not as three separate buttons. Private to Logs —
 * a second screen that wants the same control can promote it then.
 */
export function SegmentedControl<Value extends string>({
  label,
  onChange,
  options,
  value,
}: Readonly<{
  label: string;
  onChange: (value: Value) => void;
  options: ReadonlyArray<{ label: string; value: Value }>;
  value: Value;
}>) {
  return (
    <div
      aria-label={label}
      className="flex items-center gap-0.5 rounded-sm bg-surface-inset p-0.5"
      role="group"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "rounded-xs px-2 py-1 text-[12px]",
              selected
                ? "bg-card font-semibold text-foreground"
                : "font-medium text-muted-foreground",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
