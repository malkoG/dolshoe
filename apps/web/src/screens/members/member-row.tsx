import { ListRowLink, ListRowMain, ListRowMeta } from "@dolshoe/ui/components/list-row";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";

import type { MembershipRole } from "../../lib/organizations";
import { RoleSelect } from "./role-select";

/**
 * One member on the roster.
 *
 * @remarks
 * Private to this screen. ListRow already wraps; this stub is the members
 * composition: name and handle on one truncating line (Left min-width 240,
 * so the Right cluster drops below ~560px), joined date, and either a role
 * badge or the admin controls.
 */
export function MemberRow({
  canAdminister,
  canGrantOwner,
  handle,
  isSelf,
  joinedLabel,
  name,
  onRemove,
  onRoleChange,
  role,
}: Readonly<{
  canAdminister: boolean;
  canGrantOwner: boolean;
  handle: string;
  isSelf: boolean;
  joinedLabel: string;
  name: string;
  onRemove?: () => void;
  onRoleChange?: (role: MembershipRole) => void;
  role: MembershipRole;
}>) {
  return (
    <ListRowLink className="gap-x-3" density="compact">
      <ListRowMain className="flex min-w-[240px] flex-1 items-center gap-2 overflow-hidden">
        <strong className="max-w-[260px] truncate font-semibold">{name}</strong>
        <span className="min-w-0 flex-1 truncate font-mono text-faint">{handle}</span>
      </ListRowMain>

      <ListRowMeta className="gap-3 text-muted-foreground">
        <span className="whitespace-nowrap">{joinedLabel}</span>
        {canAdminister && !isSelf ? (
          <>
            <RoleSelect
              ariaLabel={`Role for ${name}`}
              canGrantOwner={canGrantOwner}
              className="w-[120px]"
              onValueChange={onRoleChange}
              size="sm"
              value={role}
            />
            <Button onClick={onRemove} size="xs" type="button" variant="outline">
              Remove
            </Button>
          </>
        ) : (
          <StatusBadge>{role.toLowerCase()}</StatusBadge>
        )}
      </ListRowMeta>
    </ListRowLink>
  );
}
