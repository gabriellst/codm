/**
 * Build the extension: bundles demo/reconstruct.ts → extension/lib/reconstruct.js
 *
 * Usage: bun e2e/extension/build.ts
 */

// Um `export {}` vazio torna este arquivo um MÓDULO, que é o que autoriza o `await` de topo abaixo.
// Ele passou a fazer falta quando `extension/build.ts` entrou no `include` do tsconfig — antes disso
// nada type-checava este script, e o `await` solto convivia com o erro sem que ninguém o visse.
export {}

await Bun.build({
	entrypoints: ['./demo/reconstruct.ts', './demo/cdp-snapshot.ts'],
	outdir: './extension/lib',
	format: 'esm',
	target: 'browser',
	minify: false,
})

console.log('Built demo/*.ts → extension/lib/')
