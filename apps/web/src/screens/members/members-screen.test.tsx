import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { dateFormatter } from "../../lib/format";
import { MembersReview } from "./members-review";
import { membersScreenStateNames, membersScreenStates } from "./members-screen.states";

function trailLabels(): string[] {
  const bar = document.querySelector("[data-slot=top-bar]");
  if (bar == null) return [];
  return [...bar.querySelectorAll("[data-slot=breadcrumb]")].map((node) => node.textContent ?? "");
}

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. If a factory and the view drift apart, the silhouette
 * would photograph a state the test no longer describes.
 */
describe("MembersScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(membersScreenStates)).toEqual([...membersScreenStateNames]);
  });

  test("populated shows the invite form, roster, and outstanding invitations", () => {
    render(<MembersReview {...membersScreenStates.populated()} />);

    expect(trailLabels()).toEqual(["Acme Payments", "Members"]);
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(
      screen.getByText("Who can read this organization's projects, and who can change them."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Invite a GitHub account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();

    expect(screen.getByText("4 members")).toBeTruthy();
    expect(screen.getByText("Koding Warrior")).toBeTruthy();
    expect(screen.getByText("@kodingwarrior")).toBeTruthy();
    expect(document.querySelector("[data-slot=status-badge]")?.textContent).toBe("owner");
    expect(screen.getByText("Mina Park")).toBeTruthy();
    expect(screen.getByText("ops-bot@acme.example")).toBeTruthy();
    expect(
      screen.getByText(`Joined ${dateFormatter.format(new Date("2026-08-14T00:00:00.000Z"))}`),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove" }).length).toBe(3);

    expect(screen.getByText("2 outstanding invitations")).toBeTruthy();
    expect(screen.getByText("@octocat")).toBeTruthy();
    expect(screen.getByText("Invited by Koding Warrior")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Withdraw" }).length).toBe(2);
  });

  test("invitationLink keeps the roster behind a reveal dialog that cannot be a second copy", () => {
    render(<MembersReview {...membersScreenStates.invitationLink()} />);

    expect(trailLabels()).toEqual(["Acme Payments", "Members"]);
    expect(screen.getByRole("heading", { name: "Send this link to @octocat" })).toBeTruthy();
    expect(screen.getByText(/stores only a hash of this link/)).toBeTruthy();
    expect(screen.getByText("Invitation")).toBeTruthy();
    expect(
      screen.getByText("https://dolshoe.example.com/invitations/inv_9f3c2a7d1e5b4c8a6d2f0e1b"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "I've sent it" })).toBeTruthy();
    expect(screen.getByText("4 members")).toBeTruthy();
  });

  test("compact photographs the long name that has to truncate", () => {
    const props = membersScreenStates.compact();
    expect(props.chrome.className).toContain("w-[768px]");

    render(<MembersReview {...props} />);

    expect(trailLabels()).toEqual(["Acme Payments", "Members"]);
    expect(screen.getByText("5 members")).toBeTruthy();
    expect(screen.getByText("Alexandra Fitzgerald-Whitmore")).toBeTruthy();
    expect(screen.getByText("@alexandra.fitzgerald-whitmore")).toBeTruthy();
  });

  test("mobile photographs the wrap width, not a second set of labels", () => {
    const props = membersScreenStates.mobile();
    expect(props.chrome.className).toContain("w-[400px]");
    expect(props.chrome.variant).toBe("mobile");

    render(<MembersReview {...props} />);

    expect(trailLabels()).toEqual(["Acme Payments", "Members"]);
    expect(document.querySelector("[data-slot=sidebar-trigger-stub]")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
    expect(screen.getByText("4 members")).toBeTruthy();
    expect(screen.getByText("2 outstanding invitations")).toBeTruthy();
  });
});
