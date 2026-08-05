import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/**
 * The line that says where you are, above the panels that say what is here.
 *
 * @remarks
 * `eyebrow` carries the slug or scope the page sits under, set in the mono face
 * so it reads as an identifier rather than prose. It is optional: a page whose
 * title is already unambiguous should not invent one.
 */
function PageHeading({
  actions,
  children,
  className,
  description,
  eyebrow,
}: Readonly<{
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
}>) {
  return (
    <section
      data-slot="page-heading"
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}
    >
      <div className="min-w-0">
        {eyebrow != null && (
          <div className="mb-2 font-mono text-[10px] font-medium tracking-[0.09em] text-faint uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-4xl leading-[1.06] font-extrabold tracking-[-0.045em] text-balance">
          {children}
        </h1>
        {description != null && (
          <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </section>
  );
}

export { PageHeading };
