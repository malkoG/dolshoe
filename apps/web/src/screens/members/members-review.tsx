import { MembersChrome, type MembersChromeProps } from "./members-chrome";
import { MembersScreen, type MembersScreenProps } from "./members-screen";

/**
 * The silhouette composition: private org chrome around the public view.
 *
 * @remarks
 * The live route does not import this. It wraps `MembersScreen` in PageShell,
 * which already owns the real TopBar. Tests and `pnpm test:ui` are the
 * callers that need the Figma trail without a router.
 */
export interface MembersReviewState {
  chrome: Omit<MembersChromeProps, "children">;
  screen: MembersScreenProps;
}

export function MembersReview({ chrome, screen }: MembersReviewState) {
  return (
    <MembersChrome {...chrome}>
      <MembersScreen {...screen} />
    </MembersChrome>
  );
}
