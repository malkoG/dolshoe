import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { describeRefusal } from "../../lib/sign-in-refusals";
import { LOGIN_PRIVACY_NOTE, LOGIN_TITLE, LOGIN_UNCLAIMED_BODY } from "./login-copy";
import { LoginView } from "./login-view";
import { loginViewStateNames, loginViewStates } from "./login-view.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the page drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("LoginView named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(loginViewStates)).toEqual([...loginViewStateNames]);
  });

  test("default is the unclaimed instance waiting on GitHub", () => {
    const props = loginViewStates.default();
    expect(props.title).toBe(LOGIN_TITLE);
    expect(props.body).toBe(LOGIN_UNCLAIMED_BODY);
    expect(props.note).toBe(LOGIN_PRIVACY_NOTE);

    render(<LoginView {...props} />);

    expect(screen.getByRole("heading", { name: LOGIN_TITLE })).toBeTruthy();
    expect(screen.getByText(LOGIN_UNCLAIMED_BODY)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with GitHub" })).toBeTruthy();
    expect(screen.getByText(LOGIN_PRIVACY_NOTE)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Development sign-in")).toBeNull();
  });

  test("refused keeps the card and adds the allowlist alert plus development sign-in", () => {
    render(<LoginView {...loginViewStates.refused()} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(describeRefusal("not_allowed"))).toBeTruthy();
    expect(screen.getByRole("heading", { name: LOGIN_TITLE })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with GitHub" })).toBeTruthy();
    expect(screen.getByText("Development sign-in")).toBeTruthy();
    expect((screen.getByLabelText("GitHub login") as HTMLInputElement).value).toBe("dev");
    expect(screen.getByRole("button", { name: "Sign in as this account" })).toBeTruthy();
  });
});
