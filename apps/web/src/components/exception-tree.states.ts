import type { ComponentProps } from "react";

import type { NormalizedException } from "../lib/error-reports";
import type { ExceptionTree } from "./exception-tree";

/**
 * Named states for the exception tree.
 *
 * @remarks
 * The tree is already a public view: it receives a stored exception and
 * paints it. These factories are the other composition root — the one a
 * construction test and a silhouette use instead of fetching a report.
 *
 * There is no idle or in-progress here. The tree does not load; the route
 * that wraps it does. Inventing a spinner the component cannot show would
 * only photograph a lie.
 */
export type ExceptionTreeProps = ComponentProps<typeof ExceptionTree>;

type Frame = NonNullable<NormalizedException["frames"]>[number];

const appFrame: Frame = {
  functionName: "chargeOrder",
  fileName: "src/checkout/charge.ts",
  lineNumber: 42,
  columnNumber: 18,
  inApp: true,
  origin: "app",
  sourceLine: "return customer.defaultPaymentMethod.charge(order.total);",
  preContext: [
    "const customer = await store.findCustomer(order.customerId);",
    "if (customer.defaultPaymentMethod == null) {",
  ],
  postContext: ["}", "await store.markPaid(order.id);"],
};

const libraryFrame: Frame = {
  functionName: "dispatch",
  fileName: "node_modules/express/lib/router/index.js",
  lineNumber: 631,
  inApp: false,
  origin: "dependency",
};

const runtimeFrame: Frame = {
  functionName: "processTicksAndRejections",
  fileName: "node:internal/process/task_queues:95:5",
  origin: "runtime",
};

function empty(): ExceptionTreeProps {
  return {
    exception: {
      type: "RuntimeError",
      message: "The reporter stored this failure without any frames.",
    },
  };
}

function populated(): ExceptionTreeProps {
  return {
    exception: {
      type: "TypeError",
      message: "Cannot read properties of undefined (reading 'charge')",
      frames: [appFrame, libraryFrame, runtimeFrame],
    },
  };
}

/**
 * A wrapper that rethrew, and the application frame that actually failed.
 *
 * @remarks
 * This is the layout the tree exists to make obvious: the aside names both
 * exceptions, and the content opens on the application's own code rather
 * than on the framework that wrapped it.
 */
function causedBy(): ExceptionTreeProps {
  return {
    exception: {
      type: "CheckoutError",
      message: "Checkout failed",
      frames: [libraryFrame, runtimeFrame],
      cause: {
        type: "TypeError",
        message: "Cannot read properties of undefined (reading 'charge')",
        frames: [appFrame],
      },
    },
  };
}

export const exceptionTreeStates = {
  empty,
  populated,
  causedBy,
} as const;

export const exceptionTreeStateNames = ["empty", "populated", "causedBy"] as const;

export type ExceptionTreeStateName = (typeof exceptionTreeStateNames)[number];

export function isExceptionTreeStateName(value: string | null): value is ExceptionTreeStateName {
  return value != null && (exceptionTreeStateNames as readonly string[]).includes(value);
}
