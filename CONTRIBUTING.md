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

## Development workflow

1. Run `mise install`.
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
