import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TokensScreen } from "./tokens-screen";
import { tokensScreenStateNames, tokensScreenStates } from "./tokens-screen.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the screen drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("TokensScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(tokensScreenStates)).toEqual([...tokensScreenStateNames]);
  });

  test("populated lists live and revoked tokens and the reporting panel", () => {
    render(<TokensScreen {...tokensScreenStates.populated()} />);

    expect(screen.getByRole("heading", { name: "Tokens" })).toBeTruthy();
    expect(screen.getByText("3 tokens")).toBeTruthy();
    expect(screen.getByText("checkout-api · production")).toBeTruthy();
    expect(screen.getByText("dsh_a7f3k2…")).toBeTruthy();
    expect(screen.getByText("payments worker")).toBeTruthy();
    expect(screen.getByText("local dev (mina)")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
    expect(screen.getByText(/Revoked /)).toBeTruthy();
    expect(screen.getByText("Never used")).toBeTruthy();
    expect(screen.getByText("Reporting from your application")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Issue token" })).toBeTruthy();
  });

  test("reveal shows the one-time DSN and token", () => {
    render(<TokensScreen {...tokensScreenStates.reveal()} />);

    expect(
      screen.getByRole("heading", { name: "Copy this now — it will not be shown again" }),
    ).toBeTruthy();
    expect(screen.getByText("DSN")).toBeTruthy();
    expect(
      screen.getByText(
        "https://dsh_a7f3k2x9LmN4pRt7vWy2bcd6eFg8hJk@dolshoe.example.com/ingest/8cl1",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy DSN" })).toBeTruthy();
    expect(screen.getByText("dsh_a7f3k2x9LmN4pRt7vWy2bcd6eFg8hJk")).toBeTruthy();
    expect(screen.getByRole("button", { name: "I've stored it" })).toBeTruthy();
  });

  test("revoke asks to confirm the named token", () => {
    render(<TokensScreen {...tokensScreenStates.revoke()} />);

    expect(
      screen.getByRole("heading", { name: "Revoke “checkout-api · production”?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Anything still reporting with this token stops being accepted/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke token" })).toBeTruthy();
  });
});
