---
name: clean-branch
description: Update the `clean` branch by rebasing from `dev` and stripping all domain-specific code. Use when `dev` has architectural changes that should be reflected in the generic boilerplate. Use this skill to maintain the clean boilerplate branch.
---

# Update Clean Branch

Synchronizes the `clean` branch with `dev` by rebasing and then stripping all domain-specific code, leaving a generic fullstack TypeScript boilerplate.

## Why This Exists

The `clean` branch serves as a reusable starting point for new projects. Whenever `dev` gains architectural improvements (new patterns, infrastructure, tooling), `clean` should inherit those improvements without any domain-specific code.

## When to Use

- `dev` has new architectural changes (infrastructure, tooling, shared patterns) that `clean` should inherit
- New bounded contexts were added to `dev` that need to be stripped from `clean`
- New frontend routes/pages were added that are domain-specific
- Shared utilities or enums were added that are domain-specific

## When NOT to Use

- Changes on `dev` are purely domain-specific with no architectural value
- The `clean` branch doesn't exist yet (create it first with a full initial strip)
- You only need to fix a bug on `clean` (just fix it directly)

## Prerequisites

- The `clean` branch exists and was previously stripped
- You understand which bounded contexts are domain-specific vs. generic
- Working directory is clean (no uncommitted changes)

## What Gets Kept vs. Stripped

### Always Keep (Generic Infrastructure)

| Category | What |
|----------|------|
| **Backend contexts** | `shared`, `auth`, `ui` |
| **Shared enums** | `Country`, `Language`, `BrazilianState`, `NotificationLevel`, `RoleType` |
| **Shared infra** | DI container, error handling, OpenAPI, mediator, services |
| **Auth** | BetterAuth setup, session, sign-in/sign-up controllers |
| **UI context** | Onboarding (generic), user details, notifications |
| **Frontend** | Landing page (generic), sign-in, sign-up, reset-password, dashboard (generic) |
| **Components** | Navbar (Dashboard only), Header (breadcrumbs + notifications), all primitives |
| **Skills & Agents** | All `.claude/skills/` and `.claude/agents/` (with `@monorepo` namespace) |
| **Docs** | `BACKEND.md`, `FRONTEND.md`, `COMPONENTS.md` |

### Always Strip (Domain-Specific)

| Category | What |
|----------|------|
| **Backend contexts** | Any context beyond `shared`, `auth`, `ui` (e.g., `clinic`, `doctor`, `patient`, `service`, `agent`) |
| **Domain enums** | Enums tied to business logic (e.g., `AppointmentStatus`, `MemberType`, `ExternalPlatform`) |
| **Domain schemas** | Drizzle schema files beyond `authentication.ts` and `ui.ts` |
| **Domain events** | All event files (events are domain-specific by nature) |
| **Frontend routes** | Any route beyond `/dashboard`, `/sign-in`, `/sign-up`, `/reset-password`, `/` (landing) |
| **Domain components** | Dashboard sections beyond generic overview, domain-specific dialogs/forms |
| **Project docs** | `SYSTEM.md`, `PRD.md`, `.plans/`, `docs/reviews/`, `prompts/` |

## Process

### Step 0: Preparation

```bash
# Ensure clean working directory
git status

# Switch to clean branch
git checkout clean

# Rebase onto dev
git rebase dev
```

If rebase has conflicts, resolve them favoring the `clean` side for stripped files and `dev` side for infrastructure files. If too many conflicts, consider `git checkout clean && git reset --hard dev` and re-stripping from scratch.

### Step 1: Identify What's New on `dev`

Run discovery to find what needs stripping:

```bash
# List all backend contexts (directories under packages/api/typescript/src/ with index.ts)
ls -d packages/api/typescript/src/*/

# List all Drizzle schema files
ls packages/api/typescript/src/shared/db/drizzle/schema/

# List all frontend route directories
ls -d packages/app/src/routes/*/
ls -d packages/app/src/routes/\(app\)/*/

# List all shared enums
ls packages/api/typescript/src/shared/enums/

# List all shared events
ls packages/api/typescript/src/shared/events/

# Search for domain-specific routers in the composition root
grep "import.*Router.*from" packages/api/typescript/src/routers.ts
```

Compare against the "Always Keep" list above. Everything else is a candidate for stripping.

### Step 2: Strip Backend Contexts

For each domain-specific context directory:

```bash
rm -rf packages/api/typescript/src/<context>/
```

Then update **`packages/api/typescript/src/routers.ts`** and the **`CONTEXTS` manifest** (`packages/api/typescript/src/shared/contexts.ts`):
- Remove import for deleted context routers
- Remove their entries from the `ROUTERS` map **and** from `CONTEXTS` (the `satisfies Record<ContextModule, Router>` check fails until both agree — same for `CONTEXT_REGISTRIES` in `shared/registry.ts`)
- Keep only the template contexts: `SharedRouter`, `AuthRouter`, `BillingRouter`, `OwnerRouter`, `QuotaRouter`, `NotificationsRouter`, `UiRouter` (shared, auth, billing, owner, quota, notifications, ui)

### Step 3: Clean Shared References

**`packages/api/typescript/src/shared/index.ts`** (DI container):
- Remove all `import` statements from deleted contexts (usecases, repositories)
- Remove all `container.registerSingleton()` calls for deleted repos
- Update `AllUseCases` type and `allUseCases` object to only include auth + ui use cases

**`packages/api/typescript/src/shared/db/drizzle/schema/index.ts`**:
- Remove exports for deleted context schemas
- Keep only: `export * from './authentication'` and `export * from './ui'`

**`packages/api/typescript/src/shared/enums/index.ts`**:
- Remove exports for domain-specific enums
- Keep only generic enums: `BrazilianState`, `Country`, `Language`, `NotificationLevel`, `RoleType`

**`packages/api/typescript/src/shared/events/index.ts`**:
- Remove all event exports (events are domain-specific)
- Replace with: `// Domain events will be added here as contexts are created`

**`packages/api/typescript/src/shared/utils/GlobalErrorMapper.ts`**:
- Remove imports from deleted context error types
- Remove error entries for deleted contexts
- Keep: shared, auth, UI, BetterAuth error entries

**Delete domain-specific shared files:**
- `packages/api/typescript/src/shared/db/drizzle/schema/<context>.ts` for each deleted context
- `packages/api/typescript/src/shared/enums/<DomainEnum>.ts` for domain enums
- `packages/api/typescript/src/shared/events/<DomainEvent>.ts` for all events
- `packages/api/typescript/src/shared/schemas/<domain>.ts` for domain schemas

### Step 4: Clean UI Context

The `ui` context often accumulates domain-specific BFF controllers and enums.

**Delete domain-specific UI controllers:**
- Any controller directory under `packages/api/typescript/src/ui/controllers/` that serves domain pages (e.g., `dashboard/`, `patients/`, `services/`)
- Update `packages/api/typescript/src/ui/controllers/index.ts` to only export generic controllers (notifications, onboarding, user details)

**Delete domain-specific UI enums:**
- Remove enums that only exist for domain UI (e.g., `PatientListTab`, `ServiceStatus`, `AuditLogType`)
- Simplify `OnboardingStep` to: `{ WELCOME, COMPLETED }`

**Simplify UI use cases:**
- `CompleteOnboarding`: Remove domain entity creation (e.g., doctor/clinic), just mark as completed
- `GetUserDetails`: Remove domain queries, return basic user info only
- `SaveOnboardingState`: Remove domain-specific schema fields
- `GetOnboarding`: Remove domain-specific type fields

**Simplify Onboarding entity:**
- Remove domain-specific fields (e.g., `type` property for user categories)
- Default step should be `WELCOME`

### Step 5: Strip Frontend Routes

Delete all domain-specific route directories:

```bash
# Delete domain-specific app routes
rm -rf packages/app/src/routes/\(app\)/<domain-route>/

# Delete domain-specific standalone routes
rm -rf packages/app/src/routes/<domain-route>/

# Delete domain-specific dashboard sections
rm -rf "packages/app/src/routes/(app)/dashboard/-components/<DomainSection>/"
```

Keep only:
- `packages/app/src/routes/(app)/dashboard/` (with generic OverviewSection only)
- `packages/app/src/routes/(index)/` (landing page)
- `packages/app/src/routes/sign-in/`
- `packages/app/src/routes/sign-up/`
- `packages/app/src/routes/reset-password/`
- `packages/app/src/routes/(app)/route.tsx` (layout)

### Step 6: Simplify Frontend Components

**Dashboard (`packages/app/src/routes/(app)/dashboard/`):**
- Rewrite `index.tsx` to only render `<OverviewSection />`
- Rewrite `-components/index.tsx` to only export `OverviewSection` + `OverviewSectionSkeleton`
- Simplify `OverviewSection` to show a welcome message and generic placeholder stats
- Remove all SDK imports, replace with static data

**Navbar (`packages/app/src/components/Navbar/index.tsx`):**
- Single `NAVIGATION_ITEMS` with only Dashboard
- Remove domain-specific navigation items, mode selectors, context selectors
- Remove SDK imports
- Generic logo ("App" with `IconLayoutDashboard`)

**Header (`packages/app/src/components/Header/`):**
- Remove SDK imports for notifications/user data
- Replace with mock data + `// TODO: Replace with real data hooks when SDK is available`
- Create local `types.ts` for `Notification` interface if needed

**Auth pages (sign-in, sign-up, reset-password):**
- Replace SDK schema imports with inline zod schemas
- Remove domain-specific form fields (e.g., document, language, mode selector)
- Generic sidebar content (no domain branding)
- Navigation should go to `/` or `/dashboard`, not domain-specific routes

**Landing page (`packages/app/src/routes/(index)/index.tsx`):**
- Replace all domain content with generic SaaS boilerplate in English
- Placeholder features, stats, testimonials
- Generic "App" branding

**Frontend lib files:**
- `packages/app/src/lib/labels.ts`: Empty with `export {}`
- `packages/app/src/lib/consts.ts`: Empty with `export {}`
- `packages/app/src/lib/errors.ts`: Remove SDK error imports, keep generic error utilities

**Vite env types (`packages/app/src/vite-env.d.ts`):**
- Remove domain-specific session fields (e.g., `mode`)
- Keep only generic user fields

### Step 7: Regenerate Route Tree

```bash
cd packages/app && bun tsr generate
```

This removes deleted routes from `routeTree.gen.ts`.

### Step 8: Namespace Check

Ensure all references use `@monorepo` namespace (not the project-specific name):

```bash
# Search for project-specific namespace
grep -ri "<project-name>" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" -l .
```

If found, replace with `@monorepo` equivalents:
- Package names: `@monorepo/api`, `@monorepo/app`, `@monorepo/sdk`
- SDK imports: `@monorepo/sdk/app`, `@monorepo/sdk/http`, `@monorepo/sdk/api`
- Skills/agents: `@monorepo/sdk` references

### Step 9: Fresh Database Migration

```bash
# Delete old migrations
rm -rf packages/api/typescript/src/shared/db/drizzle/migrations

# Generate fresh migration from current clean schema
bun migrate:create
```

Verify the generated SQL only contains `authentication` and `ui` schema tables.

### Step 10: Clean Project Docs

```bash
rm -f SYSTEM.md PRD.md
rm -rf docs/reviews .plans prompts
```

Ensure `README.md` is generic boilerplate (not domain-specific). Ensure `CLAUDE.md` uses "Monorepo Boilerplate" title.

### Step 11: Verify Build

```bash
# Type check
bun tsc

# Lint
bun lint

# Tests
bun test

# Full build (optional but recommended)
bun build
```

Fix any errors. Common issues:
- Empty files that aren't modules (add `export {}`)
- Unused imports from deleted code
- Missing error entries in GlobalErrorMapper
- Route tree referencing deleted routes

### Step 12: Final Sweep

Search for any remaining domain-specific references:

```bash
# Search for domain terms in source files
grep -ri "clinic\|patient\|doctor\|appointment\|specialty" --include="*.ts" --include="*.tsx" -l packages/app/src/ packages/api/typescript/src/

# Search for project-specific name
grep -ri "<project-name>" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" -l .
```

Fix any remaining references. Then commit.

### Step 13: Commit

Commit in logical batches or as a single squashed commit:

```bash
git add -A
git commit -m "chore: update clean branch from dev - strip domain-specific code"
```

## Critical Rules

### Always Run Type Check Before Committing

The pre-commit hook runs `bun tsc`, `bun test`, and full build. Deleting contexts without fixing dangling imports will fail the commit. Fix ALL references atomically — don't try to commit partial deletions.

### Backend DI Container Is the Hub

`packages/api/typescript/src/shared/index.ts` registers ALL repositories and use cases. When deleting a context, you MUST remove its registrations here or the build will fail.

### GlobalErrorMapper Must Be Exhaustive

The `GlobalErrorMapper` Record type requires entries for ALL error types across all remaining contexts. If you remove an error type from a context but it's still referenced by another context's error union, you'll get a type error. Either remove the reference or keep the entry.

### BetterAuth May Have Deep Coupling

Auth hooks (e.g., `afterSignInHook`, `customSession`) may reference domain-specific types/repos. Review `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts` carefully and remove domain-specific plugins/hooks.

### Route Tree Must Be Regenerated

After deleting frontend routes, always run `cd packages/app && bun tsr generate` before committing. The generated `routeTree.gen.ts` will reference deleted routes and cause build failures.

### Events Are Always Domain-Specific

Domain events should be completely removed. The shared events barrel (`packages/api/typescript/src/shared/events/index.ts`) should be empty. Event handlers go away with their contexts.

### UI Context Accumulates Domain Code

Even though `ui` is a kept context, it often has domain-specific BFF controllers, enums, and use case logic that reference deleted contexts. Always audit `packages/api/typescript/src/ui/` thoroughly.

## Checklist

- [ ] Rebased `clean` onto latest `dev`
- [ ] Identified all new domain-specific contexts since last sync
- [ ] Deleted domain-specific backend context directories
- [ ] Cleaned `packages/api/typescript/src/routers.ts` (`ROUTERS` map) + the `CONTEXTS` manifest
- [ ] Cleaned `packages/api/typescript/src/shared/index.ts` DI registrations
- [ ] Cleaned shared schemas, enums, events, errors
- [ ] Cleaned GlobalErrorMapper
- [ ] Cleaned UI context (controllers, enums, use cases)
- [ ] Deleted domain-specific frontend routes
- [ ] Simplified dashboard to generic overview
- [ ] Simplified navbar (Dashboard only, no mode/context selectors)
- [ ] Simplified header (mock data, no SDK imports)
- [ ] Simplified auth pages (inline schemas, no domain fields)
- [ ] Genericized landing page
- [ ] Cleaned frontend lib (labels, consts, errors)
- [ ] Cleaned vite-env.d.ts (no domain session fields)
- [ ] Regenerated route tree (`cd packages/app && bun tsr generate`)
- [ ] Verified namespace is `@monorepo` everywhere
- [ ] Generated fresh database migration
- [ ] Cleaned project docs (no SYSTEM.md, PRD.md, plans, reviews)
- [ ] `bun tsc` passes
- [ ] `bun test` passes
- [ ] `bun lint` passes
- [ ] No remaining domain-specific terms in source files
- [ ] Committed changes

## References

- `docs/BACKEND.md` - Backend conventions
- `docs/FRONTEND.md` - Frontend conventions
- `packages/api/typescript/src/shared/index.ts` - DI container (central hub for registrations)
- `packages/api/typescript/src/shared/utils/GlobalErrorMapper.ts` - Error mapping (must be exhaustive)
- `packages/api/typescript/src/shared/db/drizzle/schema/index.ts` - Schema barrel exports
