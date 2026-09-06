import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ExceptionTree } from "../components/exception-tree";
import {
  exceptionTreeStateNames,
  exceptionTreeStates,
  isExceptionTreeStateName,
} from "../components/exception-tree.states";
import "../styles.css";
import { ReviewFrame } from "./frame";

/**
 * The composition root that is not the route and not the construction test.
 *
 * @remarks
 * Playwright opens this page with `?state=`, the factory of that name runs,
 * and the tree is the only thing that paints. When a second surface needs
 * the same treatment, add it here as another branch — do not grow a
 * registry until a third caller has made the duplication obvious.
 */
function stateFromSearch(): (typeof exceptionTreeStateNames)[number] {
  const name = new URLSearchParams(window.location.search).get("state");
  if (isExceptionTreeStateName(name)) return name;

  throw new Error(
    `Unknown named state ${JSON.stringify(name)}. Expected one of: ${exceptionTreeStateNames.join(", ")}.`,
  );
}

const root = document.getElementById("root");
if (root == null) throw new Error("ui-review harness is missing #root");

createRoot(root).render(
  <StrictMode>
    <ReviewFrame>
      <ExceptionTree {...exceptionTreeStates[stateFromSearch()]()} />
    </ReviewFrame>
  </StrictMode>,
);
