import { Card } from "@dolshoe/ui/components/ui/card";
import type { ReactNode } from "react";

/**
 * The centred card the two signed-out pages are built from.
 *
 * @remarks
 * Sign-in and invitation-redemption ask different questions but are the same
 * moment: someone outside the application, deciding whether to come in. They
 * looked alike before by being written twice; now they look alike because they
 * are one thing.
 */
export function AuthCard({ children, title }: Readonly<{ children: ReactNode; title: ReactNode }>) {
  return (
    <main className="grid min-h-screen place-content-center px-5 py-12">
      <Card className="w-full max-w-md gap-5 rounded-2xl p-8 shadow-panel sm:min-w-md">
        <img className="size-9" src="/dolshoe-mark.svg" alt="" />
        <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.04em] text-balance">
          {title}
        </h1>
        {children}
      </Card>
    </main>
  );
}
