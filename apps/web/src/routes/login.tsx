import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-request";
import { login } from "../lib/session";

/**
 * Only a path on this site is accepted, so a crafted `?redirect=` cannot bounce
 * a freshly signed-in visitor to somewhere else entirely. `//evil.example` is
 * rejected too: a browser reads a protocol-relative URL as another origin.
 */
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session.viewer != null) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: Login,
});

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "That email and password do not match an account.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while signing in.";
}

function Login() {
  const router = useRouter();
  const search = Route.useSearch();
  const { instanceClaimed } = Route.useRouteContext().session;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);
    try {
      await login({ email: email.trim(), password });
      // Re-runs the root load, so the app comes back knowing who this is.
      await router.invalidate();
      await router.navigate({ to: search.redirect ?? "/" });
    } catch (cause) {
      setError(describeError(cause));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={(event) => void submit(event)}>
        <img className="auth-mark" src="/dolshoe-mark.svg" alt="" />
        <h1>Sign in to Dolshoe</h1>

        {!instanceClaimed && (
          <p className="auth-note" role="status">
            This instance has no accounts yet. <Link to="/register">Claim it</Link> to become its
            first owner.
          </p>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            autoComplete="username"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {error != null && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting && <Loader2 className="spin" size={14} />}
          Sign in
        </button>
      </form>
    </main>
  );
}
