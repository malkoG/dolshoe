# Setting up GitHub sign-in

GitHub is the only way to sign in to Dolshoe. This walks through registering an
OAuth app and pointing an instance at it, start to finish.

For what signing in then _does_ — who is allowed in, how an instance is claimed,
and how people are invited — see [Organizations and
viewers](../README.md#organizations-and-viewers) in the README.

Dolshoe asks GitHub for `read:user` and `user:email`, both read-only. It never
asks for repository access.

## 1. Decide the callback URL

This is the one value worth getting right first, because GitHub has to be told
the same string you configure, character for character. It is always your
instance's public origin followed by `/api/v1/auth/github/callback`:

```text
https://dolshoe.example.com/api/v1/auth/github/callback
```

It must be an address a **browser** can reach. That is the web app's origin, not
the API's — the API is deliberately kept off the host network, and browser
traffic reaches it through the web server's `/api` proxy.

> [!IMPORTANT]
> **Locally, pin the port first.** `docker compose up` publishes the web app on
> a Docker-assigned port by default, which changes between runs and would
> invalidate your callback URL every time. Set `DOLSHOE_WEB_PORT` in `.env`
> before registering the app:
>
> ```sh
> DOLSHOE_WEB_PORT=5173
> ```
>
> Then the callback URL is `http://localhost:5173/api/v1/auth/github/callback`.

## 2. Register the OAuth app

On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
For an app owned by a team rather than by you personally, register it under the
organization instead: **your org → Settings → Developer settings → OAuth Apps**.

| Field                      | What to enter                                                 |
| -------------------------- | ------------------------------------------------------------- |
| Application name           | Anything your team will recognize on the authorization screen |
| Homepage URL               | Your instance's origin, e.g. `http://localhost:5173`          |
| Authorization callback URL | The URL from step 1, exactly                                  |

Create it, then **Generate a new client secret**. GitHub shows the secret once.

An _OAuth App_, not a _GitHub App_ — the two are different products in the same
menu. Dolshoe only needs to identify a person, which is what OAuth Apps do, and
a GitHub App carries an installation model that would buy nothing here.

## 3. Set the three variables

```sh
GITHUB_CLIENT_ID=Iv1.0123456789abcdef
GITHUB_CLIENT_SECRET=…
GITHUB_CALLBACK_URL=http://localhost:5173/api/v1/auth/github/callback
```

All three go together: set all of them or none. A partial set is refused at
startup, because the alternative is a redirect that fails much later with
nothing useful to say. Without any of them the API still starts, warns, and the
sign-in page explains that nobody can sign in yet.

## 4. Restart and sign in

Configuration is read once at startup, so restart the API after editing `.env`:

```sh
docker compose restart api
```

Open the web app and choose **Continue with GitHub**.

> [!IMPORTANT]
> On a fresh instance the first GitHub account through **claims it**, becoming
> the owner of the default organization. Set `GITHUB_ALLOWED_LOGINS` first, or
> sign in immediately, before the instance is reachable by anyone else. See
> [Claiming a new instance](../README.md#claiming-a-new-instance).

## When it does not work

| What you see                                          | Why                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GitHub says "redirect_uri is not associated"          | `GITHUB_CALLBACK_URL` and the registered callback differ. Scheme, host, port, and path all have to match |
| Back at sign-in, "not configured"                     | One or more of the three variables is unset, or the API has not been restarted since they were           |
| Back at sign-in, "took too long or started elsewhere" | The `state` cookie expired (10 minutes) or was not returned. Just start again                            |
| Back at sign-in, "not on this instance's allowlist"   | `GITHUB_ALLOWED_LOGINS` is set and does not name that login                                              |
| Back at sign-in, "no access to this instance"         | The instance is already claimed and that account has no invitation                                       |
| Signing in appears to succeed but you stay signed out | A `Secure` session cookie over plain HTTP. See `SESSION_COOKIE_SECURE`                                   |
| The callback 404s                                     | The callback URL points at the API's own origin rather than the web app's                                |

## Rotating the client secret

Generate a new one on GitHub, update `GITHUB_CLIENT_SECRET`, and restart.
Existing sessions are unaffected — the secret is only used while completing a
sign-in, never afterwards.
