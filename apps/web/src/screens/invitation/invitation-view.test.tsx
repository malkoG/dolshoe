import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  INVALID_INVITATION_MESSAGE,
  InvitationView,
  INVITATION_TITLE,
  MISMATCHED_INVITATION_MESSAGE,
  PRIVACY_NOTE,
  SIGNED_OUT_BODY,
} from "./invitation-view";
import { invitationStateNames, invitationStates } from "./invitation-view.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the card drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("InvitationView named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(invitationStates)).toEqual([...invitationStateNames]);
  });

  test("signedOut offers GitHub as the way to accept", () => {
    render(<InvitationView {...invitationStates.signedOut()} />);

    expect(screen.getByRole("heading", { name: INVITATION_TITLE })).toBeTruthy();
    expect(screen.getByText(SIGNED_OUT_BODY)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with GitHub" })).toBeTruthy();
    expect(screen.getByText(PRIVACY_NOTE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  test("signedIn names the account and the accept action", () => {
    render(<InvitationView {...invitationStates.signedIn()} />);

    expect(screen.getByRole("heading", { name: INVITATION_TITLE })).toBeTruthy();
    expect(screen.getByText("@kodingwarrior")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeTruthy();
    expect(screen.getByText(PRIVACY_NOTE)).toBeTruthy();
    expect(screen.queryByText(INVALID_INVITATION_MESSAGE, { exact: false })).toBeNull();
    expect(screen.queryByText(MISMATCHED_INVITATION_MESSAGE, { exact: false })).toBeNull();
    expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
  });

  test("signedIn without a handler does not navigate away", () => {
    render(<InvitationView {...invitationStates.signedIn()} />);

    fireEvent.submit(screen.getByRole("button", { name: "Accept invitation" }).closest("form")!);

    expect(screen.getByRole("heading", { name: INVITATION_TITLE })).toBeTruthy();
  });

  test("a refused accept is an alert, not a footer note", () => {
    render(<InvitationView {...invitationStates.signedIn()} error={INVALID_INVITATION_MESSAGE} />);

    expect(screen.getByRole("alert").textContent).toBe(INVALID_INVITATION_MESSAGE);
    expect(screen.getByText(PRIVACY_NOTE)).toBeTruthy();
  });

  test("a mismatched account is the other alert, still not a footer note", () => {
    render(
      <InvitationView {...invitationStates.signedIn()} error={MISMATCHED_INVITATION_MESSAGE} />,
    );

    expect(screen.getByRole("alert").textContent).toBe(MISMATCHED_INVITATION_MESSAGE);
    expect(screen.queryByText(INVALID_INVITATION_MESSAGE, { exact: false })).toBeNull();
  });
});
