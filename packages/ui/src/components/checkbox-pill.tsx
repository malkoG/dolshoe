import { cn } from "../lib/utils";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";

/**
 * A single boolean filter styled as a bordered pill — "Errors only" beside a
 * search field, not a settings-form checkbox.
 *
 * @remarks
 * Wraps `Checkbox` in a `Label` rather than the reverse: `Checkbox` renders
 * as a button, and a wrapping label is what gives that button an accessible
 * name. `aria-label` on the checkbox itself would double up with it.
 */
function CheckboxPill({
  checked,
  className,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  className?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <Label
      className={cn(
        "h-9 gap-2 rounded-md border border-input bg-muted px-3 text-[12px] font-medium text-foreground",
        className,
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      {label}
    </Label>
  );
}

export { CheckboxPill };
