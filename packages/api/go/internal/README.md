# internal/ — Go bounded contexts

This is the declared source root of the Go backend (`REPO.workspaces.apiGo.srcRoot`): every Go
bounded context lives at `internal/<context>/` with the same citizen layout as the TypeScript side
(`entities/`, `usecases/`, `handlers/`, `controllers/`, `projections/`, …).

The template ships with no Go contexts — `core/` carries the shared kernel only. Scaffold a
context with the CLI (see `docs/CLI.md`) or mirror an example under `examples/citizens/go/` when they land.

The whole toolchain (review classification, skill dispatch, the classify-edit hook, detectors)
resolves Go artifacts against this root — code placed elsewhere is invisible to it.
