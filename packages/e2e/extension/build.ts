/**
 * Build the extension: bundles lib/reconstruct.ts → extension/lib/reconstruct.js
 *
 * Usage: bun e2e/extension/build.ts
 */

await Bun.build({
	entrypoints: ['./lib/reconstruct.ts', './lib/cdp-snapshot.ts'],
	outdir: './extension/lib',
	format: 'esm',
	target: 'browser',
	minify: false,
})

console.log('Built lib/*.ts → extension/lib/')
