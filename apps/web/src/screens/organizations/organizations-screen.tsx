import { DataState } from "@dolshoe/ui/components/data-state";
import { ListRow, ListRowLink, ListRowMain, ListRowMeta } from "@dolshoe/ui/components/list-row";
import { PageHeading } from "@dolshoe/ui/components/page-heading";
import { Panel } from "@dolshoe/ui/components/panel";
import { StatusBadge } from "@dolshoe/ui/components/status-badge";
import { Button } from "@dolshoe/ui/components/ui/button";
import { Input } from "@dolshoe/ui/components/ui/input";
import { Label } from "@dolshoe/ui/components/ui/label";
import { Spinner } from "@dolshoe/ui/components/ui/spinner";
import { ArrowLeft, Boxes, LogOut, Plus } from "lucide-react";
import type { FormEvent } from "react";

/**
 * The slug-collision copy the create form shows after a 409.
 *
 * @remarks
 * The route maps that status onto this string; the view only paints it. Keeping
 * the words here means the named-state factory and the live form cannot drift.
 */
export const ORGANIZATION_SLUG_CONFLICT =
  "An organization with that slug already exists. Try a different name.";

export interface OrganizationsScreenOrganization {
  createdLabel: string;
  href: string;
  id: string;
  name: string;
  roleLabel: string;
  slug: string;
}

export interface OrganizationsScreenProps {
  back?: { href: string; label: string };
  creating: boolean;
  error?: string;
  name: string;
  onNameChange: (name: string) => void;
  onSignOut: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  organizations: readonly OrganizationsScreenOrganization[];
}

/**
 * The organizations list as a public view.
 *
 * @remarks
 * `/orgs` sits outside PageShell — the Figma frames are a max-w-3xl column,
 * not the sidebar chrome — so this file owns the screen and does not copy
 * Sidebar or TopBar. The route (or a named-state factory) supplies the values;
 * nothing here knows about the session cookie or `fetch`.
 */
export function OrganizationsScreen({
  back,
  creating,
  error,
  name,
  onNameChange,
  onSignOut,
  onSubmit,
  organizations,
}: OrganizationsScreenProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 md:py-16">
      {/*
        This screen sits outside the application chrome, which left the two ways
        off it — back into the app, and out of the session — with nothing to
        reach them by. Somebody who belongs to no organization yet had neither,
        and the only exit was the browser's own.
      */}
      <div className="mb-6 flex items-center justify-between gap-3">
        {back == null ? (
          <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-[-0.03em]">
            <img alt="" className="size-7" src="/dolshoe-mark.svg" />
            dolshoe
          </span>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <a href={back.href}>
              <ArrowLeft />
              {back.label}
            </a>
          </Button>
        )}

        <Button onClick={onSignOut} size="sm" type="button" variant="ghost">
          <LogOut />
          Sign out
        </Button>
      </div>

      <PageHeading eyebrow="Organizations">Where your projects live</PageHeading>

      <Panel>
        {organizations.length === 0 ? (
          <DataState
            description="Create one below to start collecting error reports and logs."
            icon={Boxes}
            kind="empty"
            title="You are not in an organization yet"
          />
        ) : (
          <ul>
            {organizations.map((organization) => (
              <ListRow key={organization.id}>
                <ListRowLink asChild>
                  <a href={organization.href}>
                    <ListRowMain>
                      <strong className="block truncate text-sm font-semibold">
                        {organization.name}
                      </strong>
                      <span className="font-mono text-xs text-muted-foreground">
                        {organization.slug}
                      </span>
                    </ListRowMain>
                    <ListRowMeta className="text-xs text-muted-foreground">
                      <StatusBadge>{organization.roleLabel}</StatusBadge>
                      <span>{organization.createdLabel}</span>
                    </ListRowMeta>
                  </a>
                </ListRowLink>
              </ListRow>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="mt-4">
        <form className="flex flex-wrap items-end gap-3 p-5" onSubmit={onSubmit}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label className="text-xs font-semibold" htmlFor="organization-name">
              New organization
            </Label>
            <Input
              id="organization-name"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Acme Payments"
              type="text"
              value={name}
            />
          </div>
          <Button className="mb-px" disabled={creating} type="submit">
            {creating ? <Spinner /> : <Plus />}
            Create
          </Button>
        </form>

        {error != null && (
          <p
            className="border-t border-border bg-brand-soft px-5 py-2 text-xs font-semibold text-brand"
            role="alert"
          >
            {error}
          </p>
        )}
      </Panel>
    </main>
  );
}
