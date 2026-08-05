import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_STACK_FRAME_LIMIT, close, init, normalizeException } from "../dist/index.mjs";

const options = {
  service: { name: "checkout-api" },
  transport: { async send() {} },
  captureUnhandledErrors: false,
};

test("init raises the runtime's frame budget, and close puts it back", async () => {
  const before = Error.stackTraceLimit;

  init(options);
  assert.equal(Error.stackTraceLimit, DEFAULT_STACK_FRAME_LIMIT);

  await close(0);
  assert.equal(Error.stackTraceLimit, before);
});

test("an application can choose its own budget, or keep the runtime's", async () => {
  const before = Error.stackTraceLimit;

  init({ ...options, stackFrameLimit: 25 });
  assert.equal(Error.stackTraceLimit, 25);
  await close(0);

  // `false` is not "zero frames": it means this reporter does not touch a
  // global the application may be managing itself.
  init({ ...options, stackFrameLimit: false });
  assert.equal(Error.stackTraceLimit, before);
  await close(0);

  assert.equal(Error.stackTraceLimit, before);
});

// A marker this test finds by reading its own file back off disk.
const CONTEXT_MARKER = "the line above the throw";
test("frames carry the source around them, read off disk", async () => {
  init(options);

  let normalized;
  try {
    // the line above the throw
    throw new Error("boom");
  } catch (error) {
    normalized = normalizeException(error);
  } finally {
    await close(0);
  }

  const frame = normalized.frames?.[0];
  assert.equal(frame?.sourceLine?.trim(), 'throw new Error("boom");');
  assert.ok(
    frame?.preContext?.some((line) => line.includes(CONTEXT_MARKER)),
    `expected the comment above the throw in preContext, got ${JSON.stringify(frame?.preContext)}`,
  );
  assert.ok((frame?.postContext?.length ?? 0) > 0);
});

test("sourceContext: false leaves frames without any source", async () => {
  init({ ...options, sourceContext: false });

  let normalized;
  try {
    throw new Error("boom");
  } catch (error) {
    normalized = normalizeException(error);
  } finally {
    await close(0);
  }

  assert.equal(normalized.frames?.[0]?.sourceLine, undefined);
  assert.equal(normalized.frames?.[0]?.preContext, undefined);
});

test("initialising twice does not lose the runtime's original budget", async () => {
  const before = Error.stackTraceLimit;

  init(options);
  init({ ...options, stackFrameLimit: 40 });
  assert.equal(Error.stackTraceLimit, 40);

  await close(0);
  assert.equal(Error.stackTraceLimit, before);
});
