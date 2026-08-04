import { newSpanId, newTraceId, nowUnixNano, toUnixNano } from "./ids.js";
import { sanitizeAttributes } from "./normalize.js";
import type {
  FinishedSpan,
  JsonValue,
  Span,
  SpanContext,
  SpanKind,
  SpanOptions,
  SpanStatusCode,
} from "./types.js";

const MAX_SPAN_NAME_LENGTH = 500;
const MAX_STATUS_MESSAGE_LENGTH = 1_024;

export interface RecordingSpanOptions {
  name: string;
  kind: SpanKind;
  parent: SpanContext | undefined;
  attributes: Readonly<Record<string, unknown>> | undefined;
  startTime: Date | number | undefined;
  /** Called once, when the span ends. */
  onEnd: (span: FinishedSpan) => void;
  /** How `recordException` reports the error it was handed. */
  onException: (exception: unknown, context: SpanContext) => void;
}

/**
 * A span being measured.
 *
 * @remarks
 * Nothing leaves here until `end()`: an unended span is not telemetry, and a
 * process that dies mid-request should not leave a half-span implying the work
 * completed.
 */
export class RecordingSpan implements Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;

  readonly #name: string;
  readonly #kind: SpanKind;
  readonly #startTimeUnixNano: bigint;
  readonly #onEnd: (span: FinishedSpan) => void;
  readonly #onException: (exception: unknown, context: SpanContext) => void;
  #attributes: Record<string, JsonValue>;
  #status: { code: SpanStatusCode; message?: string } = { code: "unset" };
  #ended = false;

  constructor(options: RecordingSpanOptions) {
    this.traceId = options.parent?.traceId ?? newTraceId();
    this.spanId = newSpanId();
    if (options.parent != null) this.parentSpanId = options.parent.spanId;

    this.#name = options.name.slice(0, MAX_SPAN_NAME_LENGTH);
    this.#kind = options.kind;
    this.#startTimeUnixNano =
      options.startTime == null ? nowUnixNano() : toUnixNano(options.startTime);
    this.#attributes = sanitizeAttributes(options.attributes) ?? {};
    this.#onEnd = options.onEnd;
    this.#onException = options.onException;
  }

  get context(): SpanContext {
    return { traceId: this.traceId, spanId: this.spanId };
  }

  setAttributes(attributes: Readonly<Record<string, unknown>>): void {
    if (this.#ended) return;
    this.#attributes = { ...this.#attributes, ...sanitizeAttributes(attributes) };
  }

  setStatus(code: SpanStatusCode, message?: string): void {
    if (this.#ended) return;
    this.#status =
      message == null ? { code } : { code, message: message.slice(0, MAX_STATUS_MESSAGE_LENGTH) };
  }

  recordException(exception: unknown): void {
    if (this.#ended) return;
    this.setStatus("error", exception instanceof Error ? exception.message : undefined);
    this.#onException(exception, this.context);
  }

  end(endTime?: Date | number): void {
    // Ending twice would report the span twice. The first end is the real one;
    // a `withSpan` whose body already ended the span must not undo that.
    if (this.#ended) return;
    this.#ended = true;

    const endTimeUnixNano = endTime == null ? nowUnixNano() : toUnixNano(endTime);
    // A clock that went backwards, or a caller-supplied end before the start,
    // would otherwise be stored as a negative duration and rejected on arrival.
    const end =
      endTimeUnixNano < this.#startTimeUnixNano ? this.#startTimeUnixNano : endTimeUnixNano;

    this.#onEnd({
      traceId: this.traceId,
      spanId: this.spanId,
      ...(this.parentSpanId == null ? {} : { parentSpanId: this.parentSpanId }),
      name: this.#name,
      kind: this.#kind,
      startTimeUnixNano: this.#startTimeUnixNano.toString(),
      endTimeUnixNano: end.toString(),
      status: this.#status,
      ...(Object.keys(this.#attributes).length === 0 ? {} : { attributes: this.#attributes }),
    });
  }
}

/** What `startSpan` resolves a parent to, given the options and what is active. */
export function resolveParent(
  options: SpanOptions,
  active: Span | undefined,
): SpanContext | undefined {
  // An explicit null means "start a new trace", which is different from an
  // absent parent meaning "use whatever is active".
  if (options.parent === null) return undefined;
  if (options.parent != null) return options.parent;
  return active?.context;
}
