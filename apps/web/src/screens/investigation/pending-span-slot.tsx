import { StatusBadge } from "@dolshoe/ui/components/status-badge";

import type { PendingParentSlot } from "./types";

/**
 * Dashed inset for a parent the server has not stored.
 *
 * @remarks
 * Kind is parent-missing only on this screen: it sits above the orphan
 * SpanRow that named it. Event-orphan (attaches whose spanId has no span)
 * is a later case — do not invent it here.
 */
export function PendingSpanSlot({ slot }: Readonly<{ slot: PendingParentSlot }>) {
  const referenced =
    slot.referencedByCount === 1
      ? "Referenced as parent by 1 span below. It may belong to a service that does not report here, may still be in flight, or may have aged out."
      : `Referenced as parent by ${slot.referencedByCount} spans below. They may belong to a service that does not report here, may still be in flight, or may have aged out.`;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-surface-inset px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Parent span not received</p>
        <StatusBadge tone="warning">parent pending</StatusBadge>
        <span className="min-w-0 flex-1" />
        <span className="font-mono text-xs text-faint">{slot.spanId}</span>
      </div>
      <p className="text-xs text-faint">{referenced}</p>
    </div>
  );
}
