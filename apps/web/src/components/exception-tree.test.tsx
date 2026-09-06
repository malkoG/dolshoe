import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ExceptionTree } from "./exception-tree";
import { exceptionTreeStateNames, exceptionTreeStates } from "./exception-tree.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the tree drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("ExceptionTree named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(exceptionTreeStates)).toEqual([...exceptionTreeStateNames]);
  });

  test("empty says the failure was stored without frames", () => {
    render(<ExceptionTree {...exceptionTreeStates.empty()} />);

    expect(screen.getByRole("heading", { name: "RuntimeError" })).toBeTruthy();
    expect(screen.getByText("No frames")).toBeTruthy();
    expect(screen.getByText("This exception was stored without any stack frames.")).toBeTruthy();
  });

  test("populated opens on the application frames", () => {
    render(<ExceptionTree {...exceptionTreeStates.populated()} />);

    expect(screen.getByRole("heading", { name: "TypeError" })).toBeTruthy();
    expect(screen.getByText("Your code")).toBeTruthy();
    expect(screen.getByText("chargeOrder")).toBeTruthy();
    expect(
      screen.getByText("return customer.defaultPaymentMethod.charge(order.total);"),
    ).toBeTruthy();
  });

  test("causedBy keeps the wrapper and the cause both visible", () => {
    render(<ExceptionTree {...exceptionTreeStates.causedBy()} />);

    expect(screen.getByText("Caused by")).toBeTruthy();
    expect(screen.getByText("CheckoutError")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "TypeError" })).toBeTruthy();
    expect(screen.getByText("chargeOrder")).toBeTruthy();
  });
});
