// THE ONE THING THAT MUST RUN BEFORE ANY TEST MODULE (bunfig.toml `[test] preload`).
//
// `./support/harnessDataDir` points `CODM_DATA_DIR` at a per-process scratch dir, and it only
// counts if it runs before the kernel's `Config.env` parse — which happens the first time ANY
// module imports `@codm/core-typescript` (measured; see that file's docblock). Inside `bun test`
// that first import is whichever test file bun loads first, not the harness, so the harness's own
// first-import position cannot cover this process: the preload can, and does, for every suite at
// once. (The react console reaches the same module through `import('@codm/api-typescript/testing')`,
// where the harness's import position IS early enough — one declaration, two entry points.)
//
// Inert on the default path: the `integration` column binds the temp-file `LibSqlDriver`,
// `MockCloudSession` and `MockContactAvatarStore` — none of them reads the key.
import './support/harnessDataDir'
import 'reflect-metadata'
