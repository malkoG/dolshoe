import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { dateFormatter } from "../../lib/format";
import { MembersReview } from "./members-chrome";
import { MembersScreen } from "./members-screen";
import { membersScreenStateNames, membersScreenStates } from "./members-screen.states";

/**
 * Constructs the public view from each named state.
 *
 * @remarks
 * This is the composition root that is not the route: no Vite host, no
 * session, no API. Named states render through `MembersReview` so the
 * photographed Sidebar + TopBar stay tied to the factory. The live route
 * mounts `MembersScreen` alone under PageShell.
 */
function labelled(name: string): HTMLElement {
  const node = document.querySelector(`[aria-label="${name}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

/**
 * Shared ReviewChrome: Sidebar + TopBar trail. Query by aria-label so
 * invitationLink still finds the shell after Radix marks it aria-hidden.
 */
function expectMembersChrome(): void {
  const trail = labelled("Breadcrumb");
  expect(within(trail).getByText("Acme Payments")).toBeTruthy();
  expect(within(trail).getByText("Members")).toBeTruthy();

  const rail = labelled("Sidebar");
  const sidebar = labelled("Organization");
  expect(within(sidebar).getByText("All projects")).toBeTruthy();
  expect(within(sidebar).getByText("Settings")).toBeTruthy();
  expect(within(sidebar).getByText("Organizations")).toBeTruthy();
  expect(sidebar.querySelector("[aria-current='page']")?.textContent).toContain("Members");
  expect(within(rail).getByText("Koding Warrior")).toBeTruthy();
}

describe("MembersScreen named states", () => {
  test("exports the states a silhouette can photograph", () => {
    expect(Object.keys(membersScreenStates)).toEqual([...membersScreenStateNames]);
  });

  test("desktop named states photograph the Figma sidebar and trail", () => {
    for (const name of ["populated", "invitationLink", "compact"] as const) {
      const { unmount } = render(<MembersReview {...membersScreenStates[name]()} />);
      expectMembersChrome();
      expect(labelled("Sidebar")).toBeTruthy();
      expect(labelled("Breadcrumb")).toBeTruthy();
      unmount();
    }
  });

  test("the public view alone does not paint chrome", () => {
    const { chromeFrame: _chromeFrame, ...view } = membersScreenStates.populated();
    render(<MembersScreen {...view} />);

    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Organization" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });

  test("populated shows the invite form, roster, and outstanding invitations", () => {
    render(<MembersReview {...membersScreenStates.populated()} />);

    expectMembersChrome();
    const body = screen.getByRole("main");
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(
      screen.getByText("Who can read this organization's projects, and who can change them."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Invite a GitHub account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();

    expect(screen.getByText("4 members")).toBeTruthy();
    expect(within(body).getByText("@kodingwarrior")).toBeTruthy();
    expect(document.querySelector("[data-slot=status-badge]")?.textContent).toBe("owner");
    expect(within(body).getByText("Mina Park")).toBeTruthy();
    expect(within(body).getByText("ops-bot@acme.example")).toBeTruthy();
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

    expectMembersChrome();
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
    expect(props.chromeFrame).toBe("org-1024");

    render(<MembersReview {...props} />);

    expectMembersChrome();
    expect(screen.getByText("5 members")).toBeTruthy();
    expect(screen.getByText("Alexandra Fitzgerald-Whitmore")).toBeTruthy();
    expect(screen.getByText("@alexandra.fitzgerald-whitmore")).toBeTruthy();
  });

  test("mobile is the Figma shell-outside: trail, no sidebar rail", () => {
    const props = membersScreenStates.mobile();
    expect(props.chromeFrame).toBe("mobile");

    render(<MembersReview {...props} />);

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByText("Acme Payments")).toBeTruthy();
    expect(within(trail).getByText("Members")).toBeTruthy();
    expect(document.querySelector("[data-slot=sidebar-trigger-stub]")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
    expect(screen.getByText("4 members")).toBeTruthy();
    expect(screen.getByText("2 outstanding invitations")).toBeTruthy();
  });
});
