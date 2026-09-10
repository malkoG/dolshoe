import { Card } from "@dolshoe/ui/components/ui/card";
import type { ReactNode } from "react";

/**
 * The centred card this screen is built from.
 *
 * @remarks
 * A private copy of the shared sign-in card, owned by the invitation
 * screen so login can keep the original. Title, body and note are the
 * slots Figma names; alerts and MockSignIn sit in `children`, between
 * the body and the action, which is also where the button lives.
 */
export function AuthCard({
  body,
  children,
  note,
  title,
}: Readonly<{
  body?: ReactNode;
  children?: ReactNode;
  note?: ReactNode;
  title: ReactNode;
}>) {
  return (
    <main className="grid min-h-screen place-content-center bg-background px-5 py-12">
      <Card className="w-full max-w-md gap-5 rounded-2xl p-8 shadow-panel sm:min-w-md">
        <img alt="" className="size-9" src="/dolshoe-mark.svg" />
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.04em] text-balance">
          {title}
        </h1>
        {body != null && <div className="text-body text-muted-foreground">{body}</div>}
        {children}
        {note != null && <p className="text-meta text-faint">{note}</p>}
      </Card>
    </main>
  );
}
