// Preload for `bun test` in this sub-package (wired via ./bunfig.toml).
//
// tsyringe-neo needs the reflect-metadata polyfill installed BEFORE any decorated class is
// evaluated. Three test files here import it themselves, and because Bun runs a suite in ONE
// process that used to be enough — whichever file happened to load first installed the polyfill
// for every other. That is incidental import ORDER, not a guarantee: on the CI runner the order
// differs and a decorated class evaluated first blew up with "tsyringe-neo requires a reflect
// polyfill" (13 failures, red `correctness` on 2026-08-07, green on every dev machine).
//
// The parent package solves this with tests/setup.ts; this file is that same fix for `core`,
// whose own nx target runs `bun test` with cwd here.
import 'reflect-metadata'
