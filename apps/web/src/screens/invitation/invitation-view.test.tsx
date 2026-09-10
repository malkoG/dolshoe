import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  INVALID_INVITATION_MESSAGE,
  InvitationView,
  INVITATION_TITLE,
  MISMATCHED_INVITATION_MESSAGE,
  SIGNED_IN_NOTE,
  SIGNED_OUT_BODY,
  SIGNED_OUT_NOTE,
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
    expect(screen.getByText(SIGNED_OUT_NOTE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  test("signedIn names the account and the accept action", () => {
    render(<InvitationView {...invitationStates.signedIn()} />);

    expect(screen.getByRole("heading", { name: INVITATION_TITLE })).toBeTruthy();
    expect(screen.getByText("@kodingwarrior")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeTruthy();
    expect(screen.getByText(SIGNED_IN_NOTE)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
  });

  test("a refused accept is an alert, not a second silhouette", () => {
    render(<InvitationView {...invitationStates.signedIn()} error={INVALID_INVITATION_MESSAGE} />);

    expect(screen.getByRole("alert").textContent).toBe(INVALID_INVITATION_MESSAGE);
    expect(screen.getByText(MISMATCHED_INVITATION_MESSAGE, { exact: false })).toBeTruthy();
  });
});
