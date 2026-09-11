import { SecretField } from "@dolshoe/ui/components/secret-field";
import { Button } from "@dolshoe/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dolshoe/ui/components/ui/dialog";

import { dateFormatter } from "../../lib/format";
import type { IssuedInvitation } from "../../lib/organizations";

/**
 * The link exists once. Copying it is the whole delivery mechanism.
 *
 * @remarks
 * The dialog is not dismissible: overlay click and Escape are swallowed so
 * the only way out is "I've sent it". Dolshoe will not show this URL again.
 */
export function InvitationRevealDialog({
  invitationOrigin,
  issued,
  onDismiss,
}: Readonly<{
  invitationOrigin?: string;
  issued: IssuedInvitation;
  onDismiss?: () => void;
}>) {
  const origin = invitationOrigin ?? globalThis.location?.origin ?? "";
  const link = `${origin}${issued.invitationUrl}`;

  return (
    <Dialog onOpenChange={(open) => !open && onDismiss?.()} open>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Send this link to @{issued.githubLogin}</DialogTitle>
          <DialogDescription>
            Dolshoe does not send email, and stores only a hash of this link, so it cannot show it
            to you again. It expires {dateFormatter.format(new Date(issued.expiresAt))}.
          </DialogDescription>
        </DialogHeader>

        <SecretField copyLabel="Copy link" label="Invitation" value={link} />

        <DialogFooter>
          <Button onClick={onDismiss} type="button">
            I've sent it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
