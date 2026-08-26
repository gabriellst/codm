#!/usr/bin/env bun
// scripts/kernel-parity.ts — o INVENTÁRIO DETERMINÍSTICO da divergência entre os dois kernels.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ POR QUE ISTO EXISTE                                                                          │
// │                                                                                              │
// │ O programa de readequação tinha quatro ondas e nenhuma delas perguntava "o que o kernel do    │
// │ template ganhou que este aqui não tem". As ondas olham para GATES (W1), RUNNERS (W2),        │
// │ COMPOSIÇÃO (W3) e para a volta (W4) — todas partindo de um item que alguém já tinha           │
// │ NOMEADO. O que nenhuma fazia era a varredura de onde os dois kernels se afastaram.           │
// │                                                                                              │
// │ O founder achou o caso que prova a lacuna: `core/src/injection/`, um módulo que existe lá,   │
// │ é exportado pelo `core/src/index.ts` de lá, e resolve o problema que ESTA árvore ainda paga  │
// │ com 34 `container.resolve(X as any) as X`. Ninguém tinha percebido porque ninguém tinha      │
// │ olhado.                                                                                      │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
//
// O QUE ELE FAZ, e o que deliberadamente NÃO faz. Ele INVENTARIA — três baldes por kernel (só lá,
// só aqui, em ambos) e, para os que estão em ambos, se o conteúdo divergiu. Ele NÃO decide o que
// entra: essa é decisão de desenho, item a item, e uma ferramenta que a tomasse estaria adivinhando.
// A saída é a lista que a decisão precisa, ordenada e estável, para que dois runs no mesmo par de
// árvores produzam exatamente o mesmo texto — é isso que faz dele um instrumento e não uma opinião.
//
// Uso:
//   bun scripts/kernel-parity.ts              # relatório legível
//   bun scripts/kernel-parity.ts --json       # o mesmo, como dado
//   TEMPLATE_ROOT=/outro/caminho bun scripts/kernel-parity.ts
//
// O caminho do template é ENV, com um default, e a ausência dele é um erro alto: um inventário que
// compara com uma árvore que não existe reportaria "nada falta" — a forma de vacuidade que este
// repo passou a sessão inteira caçando.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TEMPLATE_ROOT = resolve(process.env.TEMPLATE_ROOT ?? join(ROOT, '..', 'template-fullstack'))

/** Um kernel a comparar: o mesmo papel arquitetural nas duas árvores, ainda que em caminhos distintos. */
interface Kernel {
	readonly id: string
	/** Caminho relativo à raiz de CADA repo. Quando divergem, `here`/`there` explicitam. */
	readonly here: string
	readonly there: string
	readonly ext: readonly string[]
	/** Por que este diretório é "o kernel" e não outra pasta qualquer. */
	readonly why: string
}

const KERNELS: readonly Kernel[] = [
	{
		id: 'typescript',
		here: 'packages/api/typescript/core/src',
		there: 'packages/api/typescript/core/src',
		ext: ['.ts', '.tsx'],
		why: 'o pacote `core` é o kernel do backend TS — o que um produto herda e não escreve. Divergência aqui é a que menos se percebe, porque nada no produto quebra quando o kernel de lá ganha um módulo.',
	},
	{
		id: 'go',
		here: 'packages/api/go/core',
		there: 'packages/api/go/core',
		ext: ['.go'],
		why: 'o módulo Go `core` é o par do anterior: mesmo papel, outra linguagem. Comparado à parte porque um achado aqui quase nunca tem contrapartida direta lá — e tratá-los como um só balde esconderia isso.',
	},
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'gen', 'target', 'dist', '.nx'])

/** Todo arquivo sob `dir` com uma das extensões, relativo a `dir`, ordenado. Determinístico por construção. */
function filesUnder(dir: string, ext: readonly string[]): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) continue
				walk(join(current, entry.name))
			} else if (ext.some(suffix => entry.name.endsWith(suffix))) {
				out.push(relative(dir, join(current, entry.name)))
			}
		}
	}
	walk(dir)
	return out.sort()
}

/** Símbolos exportados de um arquivo TS/Go, por regex. Grosseiro de propósito: serve para APONTAR, não para decidir. */
export function exportedSymbols(source: string, lang: 'typescript' | 'go'): string[] {
	const names = new Set<string>()
	if (lang === 'typescript') {
		for (const match of source.matchAll(
			/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|class|function|interface|type|enum)\s+(\w+)/gm,
		)) {
			names.add(match[1] as string)
		}
		for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
			for (const raw of (match[1] as string).split(',')) {
				const name = raw
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)
					.pop()
					?.trim()
				if (name) names.add(name)
			}
		}
	} else {
		for (const match of source.matchAll(/^(?:func|type|var|const)\s+\(?[^)]*\)?\s*([A-Z]\w*)/gm)) names.add(match[1] as string)
		for (const match of source.matchAll(/^func\s+([A-Z]\w*)/gm)) names.add(match[1] as string)
		for (const match of source.matchAll(/^type\s+([A-Z]\w*)/gm)) names.add(match[1] as string)
	}
	return [...names].sort()
}

interface KernelReport {
	kernel: string
	onlyThere: string[]
	onlyHere: string[]
	bothIdentical: string[]
	bothDivergent: { file: string; symbolsOnlyThere: string[] }[]
}

function compare(kernel: Kernel): KernelReport {
	const here = join(ROOT, kernel.here)
	const there = join(TEMPLATE_ROOT, kernel.there)
	const hereFiles = filesUnder(here, kernel.ext)
	const thereFiles = filesUnder(there, kernel.ext)
	const hereSet = new Set(hereFiles)
	const thereSet = new Set(thereFiles)

	const bothIdentical: string[] = []
	const bothDivergent: { file: string; symbolsOnlyThere: string[] }[] = []
	const lang = kernel.id === 'go' ? 'go' : 'typescript'

	for (const file of thereFiles.filter(f => hereSet.has(f))) {
		const a = readFileSync(join(there, file), 'utf-8')
		const b = readFileSync(join(here, file), 'utf-8')
		if (a === b) {
			bothIdentical.push(file)
			continue
		}
		const mine = new Set(exportedSymbols(b, lang))
		bothDivergent.push({ file, symbolsOnlyThere: exportedSymbols(a, lang).filter(name => !mine.has(name)) })
	}

	return {
		kernel: kernel.id,
		onlyThere: thereFiles.filter(f => !hereSet.has(f)),
		onlyHere: hereFiles.filter(f => !thereSet.has(f)),
		bothIdentical,
		bothDivergent,
	}
}

if (import.meta.main) {
	if (!existsSync(TEMPLATE_ROOT)) {
		console.error(
			`[kernel-parity] árvore do template não encontrada em ${TEMPLATE_ROOT}. Sem ela este inventário ` +
				`reportaria "nada falta", que é a resposta errada mais convincente que existe. ` +
				`Aponte TEMPLATE_ROOT para o checkout.`,
		)
		process.exit(2)
	}

	const reports = KERNELS.map(compare)

	if (process.argv.includes('--json')) {
		console.log(JSON.stringify({ templateRoot: TEMPLATE_ROOT, reports }, null, 2))
		process.exit(0)
	}

	for (const [index, report] of reports.entries()) {
		const kernel = KERNELS[index] as Kernel
		console.log(`\n══ kernel: ${report.kernel} ══  ${kernel.here}`)
		console.log(`   ${kernel.why}`)
		console.log(
			`   só no template: ${report.onlyThere.length}  ·  só aqui: ${report.onlyHere.length}  ·  ` +
				`iguais: ${report.bothIdentical.length}  ·  divergentes: ${report.bothDivergent.length}`,
		)
		console.log(`\n   ── só no template (candidatos a entrar) ──`)
		for (const file of report.onlyThere) console.log(`      + ${file}`)
		console.log(`\n   ── só aqui (o produto foi à frente, ou o template limpou) ──`)
		for (const file of report.onlyHere) console.log(`      - ${file}`)
		console.log(`\n   ── em ambos, CONTEÚDO divergente (com símbolos que só existem lá) ──`)
		for (const entry of report.bothDivergent) {
			const missing = entry.symbolsOnlyThere.length > 0 ? `  ← ${entry.symbolsOnlyThere.join(', ')}` : ''
			console.log(`      ~ ${entry.file}${missing}`)
		}
	}

	const total = reports.reduce((sum, r) => sum + r.onlyThere.length + r.bothDivergent.length, 0)
	console.log(`\n${total} item(ns) de divergência a classificar. Este script INVENTARIA; o que entra é decisão, item a item.`)
	process.exit(0)
}
