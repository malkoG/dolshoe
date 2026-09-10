import type { ReactNode } from "react";

/**
 * The refusal strip on a settings panel.
 *
 * @remarks
 * Private to this screen. Figma paints the 409 on brand-soft inside the
 * leave body; other routes have their own alert markup, and this PR does
 * not promote a shared one.
 */
export function SettingsCallout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p
      className="w-full rounded-md border border-border bg-brand-soft px-space-3 py-space-2 text-meta-strong text-brand"
      role="alert"
    >
      {children}
    </p>
  );
}
