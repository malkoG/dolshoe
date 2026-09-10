# Contributing to Dolshoe

Dolshoe is intended to remain understandable, self-hostable, and small. Prefer
code that makes the system easier to reason about over abstractions that only
make it look more architectural.

## Working principles

### Start concrete

Implement the first real use case directly. Extract an abstraction only after
there are multiple concrete examples that reveal a stable boundary. Do not add
generic repositories, base services, or shared packages for hypothetical
reuse.

### Keep ownership close to the feature

Configuration, database lifecycle, and logging belong to application
infrastructure. Domain-specific queries belong to the feature that uses them.
Do not turn the database module into a collection of unrelated queries.

When a domain needs persistence independence, define a small repository port in
the domain or application layer and implement it in that feature's
infrastructure layer. Prisma-generated types should not become domain models by
accident.

### Treat PostgreSQL as a capability

PostgreSQL is the supported storage backend. Use its behavior intentionally
when it improves correctness or performance. Do not restrict the design to an
imaginary lowest common denominator for databases that Dolshoe does not yet
support.

### Validate at boundaries

Validate environment variables at startup and external input at the transport
boundary. Internal code should be able to rely on valid values rather than
repeating defensive checks everywhere.

### Make mutations idempotent

Treat a retried request, a redelivered event, or a double click as the normal
case, not an edge case. Key a write on the request's own identifier — an event
id, a trace and span id pair — and let a `@id`/`@unique` constraint absorb the
repeat instead of trusting the caller not to resend. Apply the same idea to a
queue consumer (dedupe on message id) or a batch job (a `WHERE NOT EXISTS`
guard): the storage-layer guarantee is what holds under concurrent or repeated
delivery, not caller discipline.

### Preserve error context

Do not silently swallow errors. Add useful operation and identity context, then
let the correct boundary decide how the error is logged or presented. Avoid
logging the same failure at every layer.

### Keep migrations append-only

Commit Prisma schema changes with their migrations. Do not edit or reorder a
migration that may already have been applied by another developer or
environment. Destructive changes require an explicit rollout plan.

### Protect the feedback loop

Unit tests must not require a database. Database behavior belongs in focused
integration or e2e tests using PostgreSQL. The complete cold test run has a
two-minute budget; investigate regressions rather than normalizing a slower
suite.

The reporter packages must not open a socket in their unit tests either. Inject
a transport instead — every one of them takes one, which is what that seam is
for.

### Specify wire-contract API docs for frontend hand-off

An `@ApiTags` decorator groups a route in the generated Swagger UI for a human
browsing it; it documents no contract a frontend caller can act on. Pair it
with `@ApiOperation`/`@ApiResponse`/`@ApiProperty` — status codes, shape,
auth — for every endpoint `apps/web` depends on. Keep internal implementation
rationale out of a client-facing description; an external caller has no
context to use it, and it is just noise in the generated document.

### Document the non-obvious why, not the what

An LSP hover shows a comment before anyone opens the file body, so write one
only for what the type signature does not already say — most exported members
need none. Reserve a why-sentence for the rare case a reader would still be
surprised after reading the code as written, and state the external cause
alone, in one plain sentence. Do not restate the mechanism the signature
already shows, and do not reach for a new document for a local implementation
choice a sentence already settles.

### Style belongs to the design system

`packages/ui` (`@dolshoe/ui`) owns how the web application looks: the colour,
type, spacing, radius and shadow tokens in `src/styles/globals.css`, the
shadcn/ui primitives in `src/components/ui/`, and the compositions built from
them. `apps/web` composes screens out of those pieces and describes layout with
Tailwind utilities. It does not decide appearance.

The practical rule is that **no colour literal belongs outside `globals.css`**.
A component that needs a shade the system does not have adds a token rather than
a hex value. Variants of an existing component are `cva` variants, not a second
component and not a template-literal class name.

A note on "start concrete" above, which this package deliberately reads against:
`apps/web` is its only consumer and a second one is not planned. It is a
separate package because presentation is a boundary worth making explicit and
awkward to cross — not because the components are expected to be reused
elsewhere. Do not treat it as a precedent for extracting other shared packages
ahead of a second caller.

Two consequences worth knowing:

- Files under `src/components/ui/` come from the shadcn CLI. They are excluded
  from oxlint in `.oxlintrc.json` and are best left close to upstream, so that
  re-adding a component is a routine operation rather than a merge. Put local
  behaviour in a composition beside them instead.
- The CLI writes `@/…` imports, which would resolve against `apps/web` at the
  call site. After running `shadcn add`, rewrite them to relative paths and run
  `pnpm format`.

### Place a file where its reuse actually lives

A route-only helper and a shared primitive look identical until a second
caller appears. Keep a route-local file flat next to the route it belongs to,
prefixed with `-`, until a second route needs it — promote it to
`apps/web/src/components/` (no prefix) the moment it does. Default every
`.ts`/`.tsx` file name to kebab-case; a hook's exported identifier still
starts with `use` and stays camelCase — only the file name changes. TanStack
Router's own file-based route naming (`$param` segments, `__root`, the
generated route tree) is a separate, mandatory convention — leave it exactly
as the router generates it.

A public view that has grown past one screen's worth of state, handlers, or
markup splits into more public views before it splits into a shared
component — reuse and readability are different reasons to split, and only
one of them requires a second caller. Do not let "nothing else uses this yet"
excuse a route component carrying every concern of the screen.

### UI that paints pixels

A reviewer approves a UI PR from the diff plus a silhouette PNG — they do not
run the app. Screenshots are a review contract, not a demo. This file is the
repo gate. Commands, attach flags, and the harness live in
[Reviewing UI from a silhouette](docs/ui-review.md).

Appearance still belongs to `@dolshoe/ui`. This section is about how a
feature that paints those tokens is structured and reviewed. It does not
replace [Style belongs to the design system](#style-belongs-to-the-design-system).

A feature that paints pixels splits the values on screen from the commands
that change them. The public view receives props. The route (or its loader)
is the only composition root that knows session cookies, `fetch`, or the live
API. A component test is another composition root: it injects a named state.
Do not add a BaseScreen framework, a generic view-model, or a second router
for tests.

UI PRs ship:

- Named-state factories next to the feature — idle, empty, populated, error,
  and one distinctive in-progress, or whichever of those the surface can
  actually show. Do not invent a state the UI cannot reach.
- A test that constructs the public view with that state. It does not boot
  Vite, TanStack Start, or the API.
- A silhouette PNG that is `f(named state)`, attached to the pull request
  body. A gitignored file on the author's disk is not the review contract —
  reviewers never open the worktree.

Prefer one `--attach` per named-state PNG, with the state in the fragment:

```sh
gh pr create --attach './apps/web/.silhouettes/exception-tree.empty.png#empty'
```

GitHub CLI 2.99 and later rewrites a Markdown image only when the path in
the body matches the `--attach` path character for character, including
`./`. `![empty](exception-tree.empty.png)` will not rewrite against
`--attach './exception-tree.empty.png'`.

Label-only differences are text assertions, not extra goldens.

Do:

- Keep live `fetch`, session cookies, and the API client out of the
  presentational view.
- Feed the construction test and the PNG from the same factory.
- Attach stills. An MP4 is welcome only when the slice's point is motion,
  and never instead of stills.

Don't:

- Fetch inside the presentational view "because the test can mock it".
- Snapshot every theme × tab × empty × error combination. Name the states
  that change the silhouette.
- Commit golden PNGs. They rot, they bloat the clone, and they are not what
  a reviewer sees.
- Treat "I ran it locally" as evidence. The reviewer did not.
- Add Storybook, a visual-regression service, or a screenshot comparison
  gate for this. The PNG is attached to the PR; it is not a CI oracle.

## Development workflow

1. Run `mise install`. This pins Python and uv alongside Node, so the Python
   reporter needs no separate setup — `uv run` prepares its environment on
   demand.
2. Copy `.env.example` to `.env`.
3. Run `pnpm install`.
4. Start PostgreSQL with `pnpm docker:up`.
5. Make a small, coherent change.
6. Add tests proportional to the behavior.
7. Run `pnpm check` and any relevant e2e tests.

Before submitting a change:

```sh
pnpm check
pnpm test:e2e
```

A PR that paints pixels also runs `pnpm test:ui` and attaches the named-state
PNGs — see [UI that paints pixels](#ui-that-paints-pixels).

## Code style

- Use TypeScript strict mode and model absence explicitly.
- Favor small modules and explicit dependencies.
- Prefer names that describe the domain operation, not the implementation
  pattern.
- Keep controllers thin; orchestration belongs in application services.
- Keep Prisma-specific queries out of controllers and domain objects.
- Use LogTape structured properties instead of manually concatenating context
  into messages.
- Let oxlint and oxfmt settle mechanical style questions.
- Python follows the same posture: type it strictly, model absence explicitly,
  and let ruff settle style. The Python reporter has no runtime dependencies,
  and adding one needs the same justification a new root dependency does.

## Commits

Write concise, natural-language commit subjects that explain the change. A
prefix taxonomy such as Conventional Commits is not required.

Good examples:

```text
Add database readiness to the health endpoint
Keep test data isolated from the development database
Explain the migration rollback procedure
```

Use the commit body when the reason or trade-off is not obvious from the diff.

## Pull requests

Keep pull requests narrow enough to review carefully. Explain what changed,
why the chosen approach fits Dolshoe, how it was tested, and any migration or
operational impact.

A PR that paints pixels is reviewed from the diff plus attached silhouettes.
See [UI that paints pixels](#ui-that-paints-pixels).
