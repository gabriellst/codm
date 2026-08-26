/**
 * THE REFLECT POLYFILL, and nothing else — a module whose entire purpose is to be the FIRST thing
 * `src/index.ts` imports.
 *
 * ── WHY A FILE EXISTS FOR ONE LINE ──────────────────────────────────────────────────────────────
 *
 * tsyringe-neo needs `Reflect.getMetadata` installed before ANY module carrying its decorators is
 * evaluated. In source that is easy: put `import 'reflect-metadata'` at the top of the entry point.
 * Under `bun build` — the `node dist/server.js` artifact the desktop shell and the e2e suite boot —
 * it is not, because the bundler does NOT preserve the order between a bare package side-effect
 * import and a bare package VALUE import. A plain
 * `import { … } from '@codm/core-typescript'` in the entry gets hoisted above it, and the bundle
 * dies before its first log line with *"tsyringe-neo requires a reflect polyfill"*.
 *
 * A RELATIVE import is ordered. That is the whole trick, and it is the only reason this file has a
 * name instead of being one line in `index.ts`.
 *
 * ── MEASURED, 2026-08-18 ────────────────────────────────────────────────────────────────────────
 *
 * This constraint was previously satisfied by ACCIDENT. `src/boot.ts` existed to acquire the
 * data-dir lock, it happened to import the kernel, and `index.ts` happened to import it right after
 * `reflect-metadata` — so the kernel's initialisation was sequenced inside a relative module that
 * came second. Nothing anywhere said the ordering mattered. Deleting `boot.ts` (once the lock became
 * an explicit call, which is what it should always have been) broke the bundle instantly:
 *
 *   bun run ./src        → boots fine (no bundler; source order preserved)
 *   node dist/server.js  → exit 1 before the first log line
 *
 * And every non-e2e gate stayed GREEN — tsc, the 1482-case suite, test:tooling, lint. Only the e2e
 * webServer caught it, because it is the only gate that boots the artifact we actually ship.
 *
 * So the ordering is now structural and named, instead of being an unstated side effect of a file
 * that was about something else entirely.
 */
import 'reflect-metadata'
