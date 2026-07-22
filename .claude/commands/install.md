---
name: install
description: Bootstrap the template monorepo environment from a fresh clone or worktree. Idempotent — safe to re-run when something drifted. Copies .env, installs deps, starts Postgres via docker-compose, creates the database if missing, applies migrations, regenerates the SDK, and (optionally) starts dev servers.
argument-hint: [--skip-dev] [--reset-db] [--dry-run]
---

# /install — Environment Setup

Bootstrap a working template environment from a fresh clone (or a
clean worktree). Run once after cloning, or whenever something
drifted (postgres container died, SDK out of sync, etc.).

**Announce at start:** "I'm bootstrapping the environment with /install."

## Assumption

Only one worktree is "active" (running `bun dev`) at a time. The
worktree isolates code; runtime (ports, postgres DB) is shared.

If you need two worktrees with `bun dev` running simultaneously,
that's a manual workflow — adjust `.env` ports / `DATABASE_URL`
yourself in the second worktree. `/install` does not handle
per-worktree port allocation today.

## When to Use

- First setup after cloning the repo.
- After pulling changes that touched `package.json`, migrations,
  or docker config.
- When `bun dev` is broken in a way that points at environment
  drift (missing dep, SDK stale, DB missing).

## When NOT to Use

- Mid-development for small changes — direct commands (`bun install`,
  `bun migrate:dev`, `bun sdk`) are faster.
- To "reset everything" — see `--reset-db` for the DB portion;
  other destructive ops are not part of `/install`.

## Flags

- `--skip-dev` — finish at step 7 (don't start `bun dev`). Useful
  when `/install` is invoked by `/build` or another script.
- `--reset-db` — drop the database before recreating it. Wipes ALL
  data in the configured DB. Asks for confirmation first.
- `--dry-run` — print every step that would run, exit without
  executing.

## Process

Each step is idempotent. If something is already done, skip it and
move on (don't fail).

### Step 1 — Verify prerequisites & ensure worktree settings

```bash
command -v bun     >/dev/null || { echo "missing: bun";    exit 1; }
command -v docker  >/dev/null || { echo "missing: docker"; exit 1; }
command -v psql    >/dev/null || { echo "missing: psql (postgresql-client)"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null || { echo "not a git repo"; exit 1; }
```

If any prerequisite is missing, **stop and report** with the install
hint for the user's platform.

**Worktree settings (local scope).** `EnterWorktree` and the
background-isolation write guard are configured under the `worktree`
key — but **this harness only honors `worktree` config from
user/local settings, never the committed project `.claude/settings.json`.**
The project file already carries `worktree.baseRef: "head"` +
`bgIsolation: "none"`, but they're silently ignored there, so
`EnterWorktree` falls back to `fresh` = `origin/<default-branch>` =
`origin/v1.4`, which is pinned at an ancient commit (old root layout,
no `packages/`) → an empty/wrong worktree. Mirror the block into
`.claude/settings.local.json` (local, untracked — per checkout) so it
takes effect:

```bash
bun -e 'const fs=require("fs");const p=".claude/settings.local.json";const s=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):{};s.worktree={...(s.worktree||{}),baseRef:"head",bgIsolation:"none"};fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");console.log("worktree settings ensured in",p);'
```

`baseRef: "head"` makes new worktrees branch from your current HEAD
(not the stale default branch); `bgIsolation: "none"` lets background
jobs edit in place. Idempotent — merges into existing local settings,
overwriting only those two keys. (Prefer `~/.claude/settings.json` if
you want this across all repos on the machine.) This step needs no
network/DB, so it runs even under `--skip-dev`.

### Step 2 — Copy `.env` from `.env.example`

```bash
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review secrets before pushing."
else
  echo ".env already present; not overwriting."
fi
```

**Never overwrite an existing `.env`.** It may contain real secrets.

If you're in a non-default worktree and want different ports / DB
name, edit `.env` manually after this step (see Assumption above).

### Step 3 — `bun install`

```bash
bun install
```

This populates `node_modules/` in all workspaces. Bun handles the
monorepo via the root `package.json` `workspaces` field.

### Step 4 — Start Postgres via docker-compose

```bash
bun docker:compose
```

This runs the existing root script:
`docker compose --env-file .env -f docker/docker-compose.yml down`
followed by
`docker compose --env-file .env -f docker/docker-compose.yml up -d`.

Verify postgres is reachable:

```bash
# Extract host/port/user from DATABASE_URL
source .env
PGURL_BASE="${DATABASE_URL%/*}/postgres"  # connect to postgres system DB
psql "$PGURL_BASE" -c "SELECT 1" >/dev/null 2>&1 \
  || { echo "Postgres unreachable at $PGURL_BASE"; exit 1; }
```

If postgres fails to come up, surface the docker-compose logs and
stop. Don't proceed without a reachable DB.

### Step 5 — Create the database if it doesn't exist

```bash
source .env
DB_NAME=$(printf '%s' "$DATABASE_URL" | sed 's,.*/\([^/?]*\).*,\1,')
PGURL_BASE="${DATABASE_URL%/*}/postgres"

# --reset-db: drop first (with confirmation)
if [ "$RESET_DB" = "1" ]; then
  read -p "About to DROP database '$DB_NAME'. Continue? [y/N] " ack
  [ "$ack" = "y" ] || { echo "aborted"; exit 1; }
  psql "$PGURL_BASE" -c "DROP DATABASE IF EXISTS \"$DB_NAME\""
fi

# Create if not exists (idempotent via -tA + EXISTS check)
EXISTS=$(psql "$PGURL_BASE" -tA -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$EXISTS" != "1" ]; then
  psql "$PGURL_BASE" -c "CREATE DATABASE \"$DB_NAME\""
  echo "Created database '$DB_NAME'."
else
  echo "Database '$DB_NAME' already exists."
fi
```

The `migrate:dev` script (next step) assumes the database exists —
this is where we make sure it does. Currently `bun migrate:dev`
does NOT create the DB itself; this step fills that gap.

### Step 6 — Apply migrations

```bash
bun migrate:dev
```

This runs:
- `nx run channel:migrate` (golang-migrate against the channel schema)
- `nx run api:migrate:dev` (drizzle-kit migrate against the api schema)

Both target the same Postgres database (`DATABASE_URL`); they apply
their own migration sets to disjoint schemas.

On a freshly-created DB (Step 5 just made it), this is a full
forward apply.

### Step 7 — Regenerate the SDK

```bash
bun sdk:channel
bun sdk:api
```

`sdk:channel` must run before `sdk:api` — the api SDK pulls types
from the channel SDK build output. The nx task graph already encodes
this dependency (`client:generate:api` depends on `client:build:channel`),
so a single `bun sdk` would also work — but explicit ordering keeps
the install log readable.

> Note (aspirational): ideally `bun dev` would auto-trigger SDK
> regeneration via nx when api/channel controllers changed. Today
> only `app:dev` has that dependsOn wired; `api:dev` and `channel:dev`
> do not. Until that's fixed, run `bun sdk` after backend controller
> changes manually.

### Step 8 — Start `bun dev` (skip if `--skip-dev`)

```bash
bun dev
```

This runs `nx run-many -t dev -p api,channel,app --parallel=3`. Three
servers boot:

- `api` on `PORT` (default 3030)
- `channel` on `CHANNEL_PORT` (default 3031)
- `app` on `VITE_PORT` (default 5173, with `--host` for LAN access)

`bun dev` is long-running. `/install` should NOT block waiting on
it — start it in the background OR end the `/install` flow telling
the user "ready; run `bun dev` to start servers". Choose based on
context:

- **Interactive session (user is at the keyboard):** report ready
  and end. Let the user run `bun dev` themselves.
- **Automated context (e.g. `/build` invoking `/install` to set up
  a worktree):** use `--skip-dev`. `/build` doesn't need dev servers
  running for `bun test` / `bun tsc` / `bun lint`.

When `--skip-dev` is NOT set and we're interactive, suggest the
command rather than spawning it — the user picks the terminal where
the long-running process lives.

### Step 9 — Report

Output one summary:

```
Install complete.

Environment:
  .env: <created | already present>
  Worktree settings: ensured in .claude/settings.local.json (baseRef=head, bgIsolation=none)
  Postgres: up (database '<DB_NAME>' <created | already existed>)
  Migrations: applied (channel + api)
  SDK: regenerated (channel + api)

Next:
  bun dev     # start api + channel + app on default ports
  bun test    # run integration tests (uses PGlite, no postgres needed)
  bun e2e     # run Playwright E2E

Worktree note: only one worktree should run `bun dev` at a time —
otherwise port 3030/3031/5173 will collide and they'll share the
same database.
```

## --dry-run mode

When `--dry-run` is set, walk every step and **print the exact
command** that would run, but skip execution. The output is the
same as the real run but no side effects. Use this to verify the
script before a destructive operation (e.g., before `--reset-db`).

## Constraints

- **Idempotent.** Every step must be safe to re-run. Step 2 doesn't
  overwrite `.env`; Step 5 doesn't drop an existing DB (unless
  `--reset-db`); Step 6 is no-op when migrations are already applied.
- **Stop on first hard error.** If postgres won't start, don't
  attempt migrate. Each step's exit code is a gate.
- **Surface stderr.** When something fails, paste the failing
  command's stderr into the transcript so the user sees the real
  cause.
- **No automatic destructive ops.** `--reset-db` requires explicit
  confirmation. No file deletion outside of what the user opts into.

## Relevant Files

Read for context:

- `.env.example` — template for `.env`; defines the variables we'll use
- `package.json` — root scripts (`bun dev`, `bun migrate:dev`, etc.)
- `docker/docker-compose.yml` — postgres + ancillary services
- `nx.json` — nx task graph config (caching, parallel)
- `packages/*/project.json` — per-workspace nx targets

Write only:

- `.env` — and only if it didn't already exist (Step 2).
- `.claude/settings.local.json` — idempotent merge of the `worktree`
  block only (Step 1); never touches other keys.

Never write:

- Code, schema, migration files. `/install` is environment setup
  only; the migrations themselves come from the codebase, not from
  this command.

## Anti-Patterns (do NOT do)

- ❌ **Overwriting an existing `.env`.** It may contain real secrets.
  Read-or-skip semantics in Step 2.
- ❌ **Running `--reset-db` without confirmation.** Wipes data.
  Always prompt.
- ❌ **Proceeding past a step that failed.** Postgres not up → don't
  migrate. Migrate failed → don't run SDK regen.
- ❌ **Spawning `bun dev` as a foreground process that blocks the
  `/install` flow.** Long-running. Either background it (rare; only
  for fully-automated contexts) or end and tell the user to run it.
- ❌ **Auto-allocating ports per worktree.** Out of scope for the
  simple install. If the user needs it, they edit `.env` manually
  in their second worktree.
- ❌ **Skipping prerequisite verification.** A missing `psql` blows
  up at Step 5 with a cryptic error. Fail fast in Step 1 with a
  clear hint.
