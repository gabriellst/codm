// Ambient declarations for Bun's `import path from './asset' with { type: 'file' }` imports — the
// default export is the string path Bun resolves the asset to (a real on-disk path in interpreter
// mode, a `/$bunfs/…` path inside a `bun build --compile` binary). Used by PGliteDriver to embed
// pglite's WASM runtime + FS bundle into the compiled Tauri daemon sidecar.
declare module '*.wasm' {
	const path: string
	export default path
}
declare module '*.data' {
	const path: string
	export default path
}
