// Ambient declarations for Bun's `import path from './asset' with { type: 'file' }` imports — the
// default export is the string path Bun resolves the asset to (a real on-disk path in interpreter
// mode, a `/$bunfs/…` path inside a `bun build --compile` binary). PGliteDriver (in the nested core
// package) uses these to embed pglite's WASM runtime + FS bundle into the compiled Tauri daemon.
//
// This is a DUPLICATE of core/src/bun-file-assets.d.ts. It must live here because the api package
// consumes core SOURCE (`@codedm/core-typescript` exports `./src/index.ts`) and re-type-checks
// PGliteDriver.ts under the api program, whose `tsconfig.build.json` include (`src/**/*.ts`) does
// NOT cover core's include globs — so core's copy is never loaded when the api build compiles the
// driver, and the two `*.wasm`/`*.data` asset imports would fail with TS2307. A `.d.ts` under
// `src/` here IS covered by the api include; its global ambient module decls apply program-wide.
declare module '*.wasm' {
	const path: string
	export default path
}
declare module '*.data' {
	const path: string
	export default path
}
