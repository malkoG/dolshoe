import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
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
        title: "Error reports · Dolshoe",
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
    <main className="not-found">
      <span>404</span>
      <h1>That page is not in the report.</h1>
      <p>The link may be out of date, or the page may have moved.</p>
      <a href="/">Return to error reports</a>
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
