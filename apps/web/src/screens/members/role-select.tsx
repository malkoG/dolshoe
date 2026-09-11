import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dolshoe/ui/components/ui/select";

import type { MembershipRole } from "../../lib/organizations";

const ROLES: MembershipRole[] = ["OWNER", "ADMIN", "MEMBER"];

/**
 * The role picker, filtered to what the current viewer may actually grant.
 *
 * @remarks
 * Owner is offered only to an owner. The trigger width follows the Figma
 * SelectLight note: 130 on the invite form, 120 on a compact member row.
 */
export function RoleSelect({
  ariaLabel,
  canGrantOwner,
  className,
  onValueChange,
  size = "default",
  value,
}: Readonly<{
  ariaLabel: string;
  canGrantOwner: boolean;
  className?: string;
  onValueChange?: (role: MembershipRole) => void;
  size?: "default" | "sm";
  value: MembershipRole;
}>) {
  return (
    <Select onValueChange={(next) => onValueChange?.(next as MembershipRole)} value={value}>
      <SelectTrigger aria-label={ariaLabel} className={className} size={size}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.filter((candidate) => candidate !== "OWNER" || canGrantOwner).map((candidate) => (
          <SelectItem key={candidate} value={candidate}>
            {candidate.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
