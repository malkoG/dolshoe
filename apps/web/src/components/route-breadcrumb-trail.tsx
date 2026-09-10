import { Breadcrumb, BreadcrumbSeparator } from "@dolshoe/ui/components/breadcrumb";
import { Link, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";

/**
 * An index route's `fullPath` carries the trailing slash matching needs
 * ("/orgs/") but `Link`'s `to` union does not ("/orgs") — this narrows the
 * literal type the same way at every call site, rather than widening to
 * `string` and losing `to`'s type safety.
 */
type WithoutTrailingSlash<T extends string> = T extends `${infer Head}/`
  ? Head extends ""
    ? T
    : Head
  : T;

function withoutTrailingSlash<T extends string>(path: T): WithoutTrailingSlash<T> {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed as WithoutTrailingSlash<T>;
}

/**
 * Assembles the page's breadcrumb trail from every matched route that named
 * one via `staticData.breadcrumb`.
 *
 * @remarks
 * A route says nothing about its ancestors' labels — this is the one place
 * that reads them all at once, in match order, so the trail stays correct
 * automatically as routes nest deeper. The last labelled match renders as
 * the current page; every other one is a link back up.
 */
export function RouteBreadcrumbTrail() {
  const matches = useMatches();

  const crumbs = matches
    .map((match) => {
      const { breadcrumb } = match.staticData;
      if (breadcrumb == null) return null;
      const label =
        typeof breadcrumb === "function"
          ? breadcrumb({
              context: match.context,
              loaderData: match.loaderData,
              params: match.params,
            })
          : breadcrumb;
      return { fullPath: withoutTrailingSlash(match.fullPath), label, params: match.params };
    })
    .filter((crumb) => crumb != null);

  return (
    <>
      {crumbs.map((crumb, index) => {
        const current = index === crumbs.length - 1;
        return (
          <Fragment key={crumb.fullPath}>
            {index > 0 && <BreadcrumbSeparator />}
            {current ? (
              <Breadcrumb current>{crumb.label}</Breadcrumb>
            ) : (
              <Breadcrumb asChild>
                <Link params={crumb.params} to={crumb.fullPath}>
                  {crumb.label}
                </Link>
              </Breadcrumb>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
