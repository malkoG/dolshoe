# Reviewing UI from a silhouette

This is the companion to [UI that paints pixels](../CONTRIBUTING.md#ui-that-paints-pixels)
in CONTRIBUTING. That section is the repo gate. This file is the how-to: named
states, the harness, and how a silhouette reaches a reviewer.

Appearance still belongs to `@dolshoe/ui`. See
[Style belongs to the design system](../CONTRIBUTING.md#style-belongs-to-the-design-system).
Nothing here adds a token, a colour, or a second way to look.

## Why this exists

A reviewer should not have to start Vite, sign in, and click to the screen
under review. The public view is a function of named state. The PNG attached
to the PR is that function, photographed. "I ran it" is not evidence; the
reviewer did not.

The first product outcome is a readable investigation for a landed error,
keyed by `(projectId, traceId)`. This harness is the groundwork for reviewing
that kind of screen — not the screen itself.

## Split the view from the composition root

A feature that paints pixels has two kinds of code:

- The **public view** receives values (props). It does not know about session
  cookies, `fetch`, or the live API.
- The **composition root** wires those values in. In `apps/web` that is the
  route (or its loader). A component test is another composition root: it
  injects a named state instead of calling the API.

Do not add a BaseScreen framework, a generic view-model, or a second router
for tests. The first real screen that needs a command port — a callback the
view may invoke, implemented by the route — should take that callback as a
prop. Extract a shared helper only after a second screen has the same shape.

`ExceptionTree` is the reference. It already receives a stored exception and
paints it. The route that fetches the report stays the composition root; the
factories next to the tree are the other one.

## Named-state factories

Put a `*.states.ts` file next to the view. Export one factory per silhouette
the reviewer needs to see:

| Name          | Typical meaning                                 |
| ------------- | ----------------------------------------------- |
| `idle`        | The screen is up and waiting for a first action |
| `empty`       | The load succeeded and there is nothing to show |
| `populated`   | The ordinary case with real content             |
| `error`       | The load or the command failed                  |
| `in-progress` | One distinctive busy state, not every spinner   |

Use the names the surface can actually reach. `ExceptionTree` has no network
round-trip of its own, so its factories are `empty`, `populated`, and
`causedBy` — the last is the distinctive layout, a wrapper plus its cause.

Label-only differences (a heading that changed wording, a badge that
changed letters) are text assertions in the construction test. They do not
earn a second PNG.

## Construction tests

`apps/web` runs these under Vitest and happy-dom. They construct the public
view with a named state and assert the words and landmarks that distinguish
it. They do not start Vite, TanStack Start, Docker, or PostgreSQL.

```sh
pnpm --filter @dolshoe/web test:unit
```

Root `pnpm test:unit` and `pnpm check` include that command. The tests are
unit tests in the sense CONTRIBUTING already uses: database-free, no Compose,
and cheap enough for the two-minute budget. They lock the factory-to-view
wiring so a renamed label cannot silently drift from the silhouette it is
supposed to describe.

## Silhouettes

A silhouette is a PNG written from a named state. It is not a committed
golden and it is not a CI pixel oracle.

```sh
pnpm test:ui:install   # once per machine: Chromium for Playwright
pnpm test:ui           # writes apps/web/.silhouettes/*.png
```

`pnpm test:ui` starts a tiny Vite app that is only a composition root — it
imports the factories and mounts the public view. Playwright photographs
each named state into `apps/web/.silhouettes/`, which is gitignored. It does
not boot the TanStack Start host, does not sign in, and does not talk to the
API. Compose is not required.

`pnpm check` does **not** run `pnpm test:ui`. Chromium is an extra install,
the command writes artifacts rather than asserting pixels, and a reviewer
sees the attach on the PR, not a job log. Adding it to the default loop
would spend the feedback budget on a generator.

If Chromium is missing, the capture script says so and points at
`pnpm test:ui:install`.

## Attaching a silhouette to a PR

The review contract is the PNG in the pull request body. Prefer GitHub CLI
2.99 or later, one `--attach` per named state:

```sh
gh pr create \
  --title '…' \
  --body-file ./pr-body.md \
  --attach './apps/web/.silhouettes/exception-tree.empty.png#empty' \
  --attach './apps/web/.silhouettes/exception-tree.populated.png#populated' \
  --attach './apps/web/.silhouettes/exception-tree.causedBy.png#causedBy'
```

`#empty` is alt text for an attachment that is appended. If the body already
references the file, write the same path in the Markdown:

```markdown
![empty](./apps/web/.silhouettes/exception-tree.empty.png)
```

GitHub CLI rewrites that reference to the uploaded URL only when the path
matches the `--attach` path character for character, including `./`. These
will **not** rewrite against each other:

```text
body:     exception-tree.empty.png
--attach: ./exception-tree.empty.png
```

When a reference is rewritten, the alt text comes from the Markdown. The
`#` fragment on `--attach` applies only to files the body never mentioned.

An HTML `<img>` pointing at the same uploaded asset is fine too. A path
into your worktree is not — reviewers never open it.

## Do / don't

Do:

- Keep live `fetch`, session cookies, and the API client out of the
  presentational view.
- Feed the construction test and the PNG from the same factory.
- Attach stills. An MP4 is welcome only when the slice's point is motion,
  and never instead of stills.

Don't:

- Fetch inside the presentational view "because the test can mock it".
- Snapshot every theme × tab × empty × error combination.
- Commit golden PNGs.
- Treat "I ran it locally" as evidence.
- Add Storybook, a visual-regression service, or a screenshot comparison
  gate. The PNG is attached to the PR; it is not a CI oracle.

## Adding a second surface

Copy the `ExceptionTree` pattern: factories next to the view, a construction
test that imports them, and a line in `apps/web/src/ui-review/main.tsx` that
mounts the new states. Do not grow a registry framework until a third
surface has made the duplication obvious.
