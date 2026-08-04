import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api-request";
import { register } from "../lib/session";

export const Route = createFileRoute("/register")({
  /**
   * Registration exists to claim an instance that has no accounts, and closes
   * permanently once one does. A claimed instance sends people to sign in
   * instead, so the form is never shown when it could only fail.
   */
  beforeLoad: ({ context }) => {
    if (context.session.instanceClaimed) throw redirect({ to: "/login" });
  },
  component: Register,
});

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "This instance has already been claimed. Ask an owner for an invitation.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong while creating the account.";
}

function Register() {
  const router = useRouter();
  const [name, setName] = useState("");
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
      await register({ email: email.trim(), name: name.trim(), password });
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (cause) {
      setError(describeError(cause));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={(event) => void submit(event)}>
        <img className="auth-mark" src="/dolshoe-mark.svg" alt="" />
        <h1>Claim this instance</h1>
        <p className="auth-note">
          This Dolshoe instance has no accounts yet. The account you create here becomes the owner
          of its default organization, and registration closes afterwards.
        </p>

        <label className="auth-field">
          <span>Name</span>
          <input
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>

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
            autoComplete="new-password"
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <span className="auth-hint">At least 12 characters. Length beats punctuation.</span>
        </label>

        {error != null && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting && <Loader2 className="spin" size={14} />}
          Create account
        </button>
      </form>
    </main>
  );
}
