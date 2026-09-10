import { StatusBadge } from "@dolshoe/ui/components/status-badge";

import type { PendingParentSlot } from "./types";

/**
 * Dashed inset for a parent the server has not stored.
 *
 * @remarks
 * Kind is parent-missing only on this screen: it sits above the orphan
 * SpanRow that named it. Title, locked body, and the `missing span` chip
 * are this slot. The orphan row keeps "Parent span not received" / parent
 * pending — those are not this component.
 */
export function PendingSpanSlot({ slot }: Readonly<{ slot: PendingParentSlot }>) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-surface-inset px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Pending span</p>
        <StatusBadge tone="info">missing span</StatusBadge>
        <span className="min-w-0 flex-1" />
        <span className="font-mono text-xs text-faint">{slot.spanId}</span>
      </div>
      <p className="text-xs text-faint">Event attached; span not received yet</p>
    </div>
  );
}
