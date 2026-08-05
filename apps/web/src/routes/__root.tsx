import { Button } from "@dolshoe/ui/components/ui/button";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

import { SIGNED_OUT_SESSION, fetchSession } from "../lib/session";
import type { Session } from "../lib/session";
import appCss from "../styles.css?url";

export interface RootContext {
  session: Session;
}

export const Route = createRootRouteWithContext<RootContext>()({
  /**
   * The one call every page depends on. Answering it here means a signed-out
   * visitor never renders application chrome, and every descendant reads who the
   * caller is synchronously instead of re-fetching it.
   *
   * An unreachable API resolves to the signed-out session rather than throwing,
   * so the failure surfaces as a sign-in page rather than as a blank error
   * boundary over the whole app.
   */
  beforeLoad: async () => {
    try {
      return { session: await fetchSession() };
    } catch {
      return { session: SIGNED_OUT_SESSION };
    }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Dolshoe",
      },
      {
        name: "description",
        content: "A focused, self-hosted error reporting inbox for your services.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/dolshoe-mark.svg",
        type: "image/svg+xml",
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <main className="grid min-h-screen place-content-center px-5 py-10 text-center">
      <span className="font-mono text-xs font-medium text-brand">404</span>
      <h1 className="mx-auto mt-3 mb-2 max-w-lg text-4xl leading-[1.06] font-extrabold tracking-[-0.05em] text-balance sm:text-5xl">
        That page is not in the report.
      </h1>
      <p className="mb-6 text-[13px] text-muted-foreground">
        The link may be out of date, or the page may have moved.
      </p>
      <Button asChild className="mx-auto w-fit">
        <a href="/">Return to Dolshoe</a>
      </Button>
    </main>
  );
}

function RootDocument({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        <Scripts />
      </body>
    </html>
  );
}
