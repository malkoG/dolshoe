import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmount each constructed view before the next named state is painted.
 *
 * @remarks
 * `@testing-library/react` only hooks `afterEach` when it can see a global
 * one. These tests import Vitest explicitly, so the hook has to be ours.
 */
afterEach(() => {
  cleanup();
});
