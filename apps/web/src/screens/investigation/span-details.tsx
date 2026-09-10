import { AttributeList, attributeEntries } from "@dolshoe/ui/components/attribute-list";

import type { InvestigationSpan } from "./types";

/**
 * Expanded detail block under a SpanRow.
 *
 * @remarks
 * Attribute pills reuse `@dolshoe/ui`'s AttributeList. The status message
 * is the one place colour is a signal: a failing span's message is brand.
 */
export function SpanDetails({ span }: Readonly<{ span: InvestigationSpan }>) {
  const attributes = attributeEntries(span.attributes);

  return (
    <dl className="flex flex-col gap-4 rounded-md bg-muted p-4 text-xs">
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Field label="Span id" value={span.spanId} mono />
        <Field label="Parent" value={span.parentSpanId ?? "—"} mono />
        <Field label="Service" value={span.serviceName} mono />
        <Field label="Started" value={span.startedAt} mono />
      </div>
      {(span.scopeLabel != null || span.statusMessage != null) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {span.scopeLabel != null && <Field label="Scope" value={span.scopeLabel} mono />}
          {span.statusMessage != null && (
            <Field
              label="Status message"
              value={span.statusMessage}
              mono
              valueClassName="text-brand"
            />
          )}
        </div>
      )}
      {attributes.length > 0 && (
        <div className="flex flex-col gap-2">
          <dt className="text-faint">Attributes</dt>
          <dd>
            <AttributeList background="card" entries={attributes} />
          </dd>
        </div>
      )}
    </dl>
  );
}

function Field({
  label,
  mono,
  value,
  valueClassName,
}: Readonly<{
  label: string;
  mono?: boolean;
  value: string;
  valueClassName?: string;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-faint">{label}</dt>
      <dd className={mono ? `font-mono break-all ${valueClassName ?? ""}` : valueClassName}>
        {value}
      </dd>
    </div>
  );
}
