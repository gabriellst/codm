---
name: install
description: Bootstrap the monorepo environment from a fresh clone or worktree. Idempotent — safe to re-run when something drifted. Copies .env, installs deps, starts the compose stack (lgtm + redis; the store is a SQLite file migrated at boot), regenerates the SDK, and (optionally) starts dev servers.
argument-hint: [--skip-dev] [--reset-db] [--dry-run]
---

# /install — Environment Setup

Bootstrap a working template environment from a fresh clone (or a
clean worktree). Run once after cloning, or whenever something
drifted (a container died, SDK out of sync, stale data dir, etc.).

**Announce at start:** "I'm bootstrapping the environment with /install."

## Assumption

Only one worktree is "active" (running `bun dev`) at a time. The
worktree isolates code; runtime (ports, the SQLite data dir) is shared.

If you need two worktrees with `bun dev` running simultaneously,
that's a manual workflow — adjust `.env` ports / `CODEDM_DATA_DIR`
yourself in the second worktree. `/install` does not handle
per-worktree port allocation today.

## When to Use

- First setup after cloning the repo.
- After pulling changes that touched `package.json`, migrations,
  or docker config.
- When `bun dev` is broken in a way that points at environment
  drift (missing dep, SDK stale, corrupted data dir).

## When NOT to Use

- Mid-development for small changes — direct commands (`bun install`,
  `bun sdk`) are faster.
- To "reset everything" — see `--reset-db` for the DB portion;
  other destructive ops are not part of `/install`.

## Flags

- `--skip-dev` — finish at step 7 (don't start `bun dev`). Useful
  when `/install` is invoked by `/build` or another script.
- `--reset-db` — delete the SQLite store so the next boot migrates a
  cold file. Wipes ALL local data. Asks for confirmation first.
- `--dry-run` — print every step that would run, exit without
  executing.

## Process

Each step is idempotent. If something is already done, skip it and
move on (don't fail).

### Step 1 — Verify prerequisites & ensure worktree settings

```bash
command -v bun     >/dev/null || { echo "missing: bun";    exit 1; }
command -v docker  >/dev/null || { echo "missing: docker"; exit 1; }
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

If you're in a non-default worktree and want different ports / data
dir, edit `.env` manually after this step (see Assumption above).

### Step 3 — `bun install`

```bash
bun install
```

This populates `node_modules/` in all workspaces. Bun handles the
monorepo via the root `package.json` `workspaces` field.

### Step 4 — Start the ancillary services via docker-compose

```bash
bun docker:compose
```

This runs the existing root script:
`docker compose --env-file .env -f docker/docker-compose.yml down`
followed by
`docker compose --env-file .env -f docker/docker-compose.yml up -d`.

**There is no Postgres here.** The compose file carries `lgtm`
(traces/logs/metrics) and `redis` only. The database is a single
**SQLite file** at `$CODEDM_DATA_DIR/codedm.db`, opened by both the TS
daemon and the Go gateway. There is no `DATABASE_URL`.

### Step 5 — Nothing to create (and what `--reset-db` means now)

The data dir is created on demand by whichever sidecar boots first, so
there is no "create the database" step.

`--reset-db` deletes the SQLite file (and its `-wal` / `-shm`
siblings), which is the full reset:

```bash
# --reset-db: delete the store (with confirmation)
if [ "$RESET_DB" = "1" ]; then
  DATA_DIR="${CODEDM_DATA_DIR:-$HOME/.codedm}"
  read -p "About to DELETE the SQLite store under '$DATA_DIR'. Continue? [y/N] " ack
  [ "$ack" = "y" ] || { echo "aborted"; exit 1; }
  rm -f "$DATA_DIR/codedm.db" "$DATA_DIR/codedm.db-wal" "$DATA_DIR/codedm.db-shm"
fi
```

Stop both sidecars before deleting — removing the file underneath a
live process leaves it writing to an unlinked inode.

### Step 6 — Migrations apply themselves at boot

**Install has no migrate step.** The TS daemon (`LibsqlDriver`) and the
Go gateway (`SqliteStore`) each apply
`packages/contracts/db/schema-sqlite/migrations/*.sql` on boot,
idempotently, over the **same** `_sqlite_migrations` ledger: whoever
starts first applies, the second no-ops. A cold data dir is migrated by
step 8 (`bun dev`) — you do not need to do anything here.

`bun migrate:dev` exists for the cases where you want the schema
*without* a running server (seeding a scratch dir, a CI fixture). It runs
the daemon's own applier over the same ledger, so it never competes with
boot.

To AUTHOR a new migration (not part of `/install`), see
`.claude/skills/migrate/SKILL.md` — `bun migrate:create`, then mirror
it into the Go embed with
`bun run --cwd packages/contracts db:sync-go`.

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
  Services: up (lgtm + redis)
  Store: SQLite at <CODEDM_DATA_DIR>/codedm.db (migrated at boot)
  SDK: regenerated (api-ts + api-go)

Next:
  bun dev     # start api + channel + app on default ports
  bun test    # run integration tests (in-process SQLite, no services needed)
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
  overwrite `.env`; Step 5 doesn't touch the store (unless
  `--reset-db`); Step 6 is a no-op because the boot migrators are.
- **Stop on first hard error.** If the compose stack won't start, don't
  go on. Each step's exit code is a gate.
- **Surface stderr.** When something fails, paste the failing
  command's stderr into the transcript so the user sees the real
  cause.
- **No automatic destructive ops.** `--reset-db` requires explicit
  confirmation. No file deletion outside of what the user opts into.

## Relevant Files

Read for context:

- `.env.example` — template for `.env`; defines the variables we'll use
- `package.json` — root scripts (`bun dev`, `bun sdk`, etc.)
- `docker/docker-compose.yml` — lgtm + redis (no database service)
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
- ❌ **Proceeding past a step that failed.** Compose stack not up →
  don't go on. `bun install` failed → don't run SDK regen.
- ❌ **Spawning `bun dev` as a foreground process that blocks the
  `/install` flow.** Long-running. Either background it (rare; only
  for fully-automated contexts) or end and tell the user to run it.
- ❌ **Auto-allocating ports per worktree.** Out of scope for the
  simple install. If the user needs it, they edit `.env` manually
  in their second worktree.
- ❌ **Skipping prerequisite verification.** A missing `docker` blows
  up at Step 4 with a cryptic error. Fail fast in Step 1 with a
  clear hint.
