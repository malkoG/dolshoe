import { StatusBadge } from "@dolshoe/ui/components/status-badge";

/**
 * What part a span played: who called, who served, who queued.
 *
 * @remarks
 * The colours are the trace's only at-a-glance grammar, so they are grouped by
 * the role rather than by severity — inbound work reads blue, outbound green,
 * anything crossing a queue amber. A kind with nothing to say about it stays
 * grey rather than borrowing a colour that already means something else.
 */
const KIND_TONES: Record<string, "neutral" | "info" | "success" | "warning"> = {
  server: "info",
  client: "success",
  producer: "warning",
  consumer: "warning",
};

export function SpanKindBadge({ className, kind }: Readonly<{ className?: string; kind: string }>) {
  return (
    <StatusBadge className={className} tone={KIND_TONES[kind] ?? "neutral"}>
      {kind}
    </StatusBadge>
  );
}
