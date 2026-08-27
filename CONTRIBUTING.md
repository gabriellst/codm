# Contributing

## Branch policy — what goes straight to `main`, and what waits for a PR

`main` requires the `detect` check to pass. Admins can push past it, which makes this a question of
discipline rather than of permissions — so the rule is written down instead of assumed.

**Pull request** — anything that changes how the product BEHAVES: a use case, a controller, a
component, the contract, a migration, how a process is launched. The point is not ceremony: it is
that `detect` runs on the change before it lands, and that a behavioural change can be read as a
unit, with its reasoning, by whoever comes next.

**Straight to `main`** — the pipeline being broken. When CI itself cannot run, a PR waits on a check
that cannot pass, and the fix that unbreaks the check is held hostage by the check it unbreaks. That
is the whole exception, and it is narrow: workflow files, runner provisioning, gitignore, the scripts
CI invokes. It also covers the case where a release is failing in production and the fix is
mechanical.

The two mixed once, on 2026-08-26/27, when moving off the self-hosted runners exposed nine defects
in sequence: each fix had to land before the next run could tell us anything, so they went direct.
That was the right call for the CI defects and the wrong one for the last of them — a change to how
the agent spawns the provider binary, which is product behaviour and should have been a PR.

When in doubt: if reverting it would change what a user sees or what the app does, it is a PR.

## Before you push

```bash
bun tsc          # type-check every workspace
bun lint
bun run detect   # the mechanical detectors — the same gate `main` requires
bun run test
```

The pre-commit hook runs the staged-file linters; the pre-push hook runs the suite (and skips it
when the push only deletes a ref, since there is nothing to test).

## Commits

Conventional-commit prefixes (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`), scope in
parentheses, subject in the imperative. The body is where the reasoning goes — what was measured,
what was ruled out, why this shape and not the obvious one. A commit whose body explains only what
the diff already shows is a wasted opportunity: the diff is always available, the reasoning is not.

## Releases

`docs/RELEASE.md` — the two channels, how a stable is cut, what is signed on each platform, and the
runner setup.
