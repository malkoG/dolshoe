import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Spinner } from "./ui/spinner";

/**
 * What a list shows when it has no list to show.
 *
 * @remarks
 * Every screen that loads something can be in one of three states before it has
 * rows: still fetching, failed, or succeeded-but-empty. Each screen used to
 * spell all three out itself, which is why they drifted — the same failure read
 * differently depending on which page you were on. Naming the states once makes
 * the wording the only thing a caller decides.
 *
 * "No matches for your filters" is deliberately not a fourth state. It is an
 * empty list with different words and a different icon, and giving it its own
 * name would only invite the two to diverge again.
 */
function DataState({
  action,
  className,
  description,
  icon: Icon,
  kind,
  onRetry,
  retryLabel = "Try again",
  title,
}: Readonly<{
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  /** Ignored while loading or failing, which carry their own fixed icons. */
  icon?: LucideIcon;
  kind: "loading" | "error" | "empty";
  onRetry?: () => void;
  retryLabel?: string;
  title: ReactNode;
}>) {
  const failed = kind === "error";

  return (
    <Empty
      // A failure is worth interrupting a screen reader for; the other two are
      // ordinary progress and should not be.
      role={failed ? "alert" : "status"}
      className={cn("gap-4 px-6 py-14", className)}
    >
      <EmptyHeader className="gap-1.5">
        <EmptyMedia variant="icon" className={cn("mb-1", failed && "bg-brand-soft text-brand")}>
          {kind === "loading" ? (
            <Spinner className="size-5" />
          ) : failed ? (
            <AlertTriangleIcon />
          ) : Icon ? (
            <Icon />
          ) : undefined}
        </EmptyMedia>
        <EmptyTitle className="text-base font-bold">{title}</EmptyTitle>
        {description != null && (
          <EmptyDescription className="text-[13px]">{description}</EmptyDescription>
        )}
      </EmptyHeader>

      {(onRetry != null || action != null) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry != null && (
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <RefreshCwIcon />
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </Empty>
  );
}

export { DataState };
