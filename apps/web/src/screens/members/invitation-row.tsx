import { ListRowLink, ListRowMain, ListRowMeta } from "@dolshoe/ui/components/list-row";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";

import type { MembershipRole } from "../../lib/organizations";

/**
 * One outstanding invitation.
 *
 * @remarks
 * Private to this screen. Same wrap rule as MemberRow: the Left block fills
 * with a 240px minimum so the role, expiry, and Withdraw cluster drop to a
 * second line instead of squeezing.
 */
export function InvitationRow({
  expiresLabel,
  invitedBy,
  login,
  onWithdraw,
  role,
}: Readonly<{
  expiresLabel: string;
  invitedBy: string;
  login: string;
  onWithdraw?: () => void;
  role: MembershipRole;
}>) {
  return (
    <ListRowLink className="gap-x-3" density="compact">
      <ListRowMain className="flex min-w-[240px] flex-1 items-center gap-2 overflow-hidden">
        <strong className="max-w-[200px] truncate font-semibold">{login}</strong>
        <span className="min-w-0 flex-1 truncate font-mono text-faint">{invitedBy}</span>
      </ListRowMain>

      <ListRowMeta className="gap-3 text-muted-foreground">
        <StatusBadge>{role.toLowerCase()}</StatusBadge>
        <span className="whitespace-nowrap">{expiresLabel}</span>
        <Button onClick={onWithdraw} size="xs" type="button" variant="outline">
          Withdraw
        </Button>
      </ListRowMeta>
    </ListRowLink>
  );
}
