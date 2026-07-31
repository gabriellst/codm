import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * RAIL C — todo primitivo de `components/ui/` estende as props do seu elemento raiz.
 *
 * Um primitivo com interface fechada é um beco: o consumidor não passa `className`, não passa
 * `aria-*`, não passa `data-testid`, e o próximo dev copia o primitivo em vez de compô-lo. A regra
 * já é doutrina (primitive PRM-04 / PRM-P01); faltava falhar.
 *
 * POR QUE AQUI E NÃO NO DETECTOR (re-decidido em 30/07, MANTIDO): `scripts/detectors/component-props.ts`
 * varre bp-20/bp-29 repo-wide e EXCLUI `/ui/` de propósito. Trazer `ui/` para lá seria um gate VAZIO: o
 * `componentBlocks()` do detector só enxerga `^export function X`, e 34 dos 40 arquivos de primitivo
 * exportam por barrel no rodapé (`export { Dialog, DialogContent, … }`) — são 168 componentes de
 * primitivo e o walker veria um punhado. Esta rail roda onde os primitivos moram e lê todos eles, com um
 * predicado mais forte: a DECLARAÇÃO de props é que precisa referenciar o vocabulário, não a raiz (o que
 * pega `ConfirmDialog`, cuja raiz é `<DialogContent>` e escaparia do CP-01, que só olha raiz minúscula).
 *
 * AS DUAS METADES: a doutrina de `className` tem uma metade de DECLARAÇÃO (o tipo expõe a superfície) e
 * uma de ENCANAMENTO (o valor do chamador chega mesmo na raiz). Os dois primeiros testes são a primeira
 * metade. O terceiro é a segunda: uma raiz com `className="…"` literal AO LADO de `{...props}` não mescla
 * — o último a escrever ganha, e quem passou `className` ou apaga o estilo do primitivo ou é apagado por
 * ele. `cn()` é o que mescla. Nascido vermelho em `sonner.tsx` (`<Sonner className="toaster group" …
 * {...props} />`), o único caso do diretório na medição de 30/07.
 *
 * ESCOPO: `components/ui/*.tsx`, UM nível — o glob literal que `.claude/registry.yaml` usa para
 * mapear a skill `primitive`. `icons/` fica fora por construção: os 125 ícones são
 * `forwardRef(function X(props: SVGProps<SVGSVGElement>, ref))` com spread no `<svg>`, já
 * compliant por outro vocabulário. Uma varredura `**\/*.tsx` acusaria 136 arquivos; esta acusa 10.
 *
 * `availability.tsx` (1051 linhas, código morto — zero consumidores) foi DELETADO por ratificação do
 * founder (30/07, ver E-C3 no plano) em vez de refatorado. Os números nascidos-vermelhos encolhem de
 * 19 violações/10 arquivos (o snapshot da spec) para o que a varredura mede agora sem ele.
 */

const UI = resolve(import.meta.dirname, '../../src/components/ui')
/** Os quatro vocabulários que PRM-04 aceita como "estende a raiz". */
const EXTENDS_ROOT = /ComponentProps\s*<|SVGProps|\.Props\b|VariantProps/

/** Primitivos isentos, com o PORQUÊ. Vazia é o estado correto. */
const WHITELIST: Record<string, string> = {}

async function primitiveFiles(): Promise<string[]> {
	const out: string[] = []
	for await (const entry of new Bun.Glob('*.tsx').scan({ cwd: UI, onlyFiles: true })) {
		if (/\.(test|stories)\.tsx$/.test(entry)) continue
		out.push(entry)
	}
	return out.sort()
}

/** O texto da declaração `XProps`, até a próxima declaração de topo. */
function declarationBody(source: string, start: number, matchLength: number): string {
	const after = source.slice(start + matchLength)
	const next = after.search(/^(?:export |function |const |interface |type |\/\*\*)/m)
	return next === -1 ? after : after.slice(0, next)
}

/**
 * A tag de abertura da primeira raiz JSX de um componente — `<Sonner theme={…} className="…" …>`.
 * Conta chaves para que um `>` dentro de uma expressão de prop (`onClick={() => x}`) não encerre a tag.
 */
function rootOpeningTag(body: string): string | null {
	const m = body.match(/return(?:\s*\(\s*|\s+)</)
	if (!m) return null
	const open = (m.index ?? 0) + m[0].length - 1
	let depth = 0
	for (let i = open; i < body.length; i++) {
		const c = body[i]
		if (c === '{') depth++
		else if (c === '}') depth--
		else if (c === '>' && depth === 0) return body.slice(open, i + 1)
	}
	return null
}

describe('rail C — primitivo de components/ui/ estende as props da raiz (primitive PRM-04)', () => {
	it('nenhuma declaração *Props fechada', async () => {
		const offenders: string[] = []
		for (const file of await primitiveFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(UI, file), 'utf8')
			for (const m of source.matchAll(/^(?:export\s+)?(?:interface|type)\s+([A-Z][A-Za-z0-9]*Props)\b/gm)) {
				if (EXTENDS_ROOT.test(declarationBody(source, m.index ?? 0, m[0].length))) continue
				offenders.push(`${file}:${source.slice(0, m.index).split('\n').length} ${m[1]}`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('nenhum `className?: string` à mão — quem estende a raiz já ganhou className', async () => {
		const offenders: string[] = []
		for (const file of await primitiveFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(UI, file), 'utf8')
			for (const m of source.matchAll(/className\?:\s*string/g)) {
				offenders.push(`${file}:${source.slice(0, m.index).split('\n').length}`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('nenhuma raiz clobbra o className do chamador — literal + spread sem cn()', async () => {
		const offenders: string[] = []
		for (const file of await primitiveFiles()) {
			if (WHITELIST[file]) continue
			const source = readFileSync(join(UI, file), 'utf8')
			for (const m of source.matchAll(/^(?:export\s+)?function ([A-Z][A-Za-z0-9]*)/gm)) {
				const body = declarationBody(source, m.index ?? 0, m[0].length)
				const tag = rootOpeningTag(body)
				if (!tag) continue
				const literal = /className=(["'`])/.test(tag)
				const spread = /\{\.\.\.[A-Za-z_$][\w$]*\}/.test(tag)
				const merged = /className=\{[^}]*\bcn\(/.test(tag)
				if (literal && spread && !merged) offenders.push(`${file}:${source.slice(0, m.index).split('\n').length} ${m[1]}`)
			}
		}
		expect(offenders).toEqual([])
	})

	it('o escopo é o glob do registry — um nível, sem icons/', async () => {
		const files = await primitiveFiles()
		expect(files.length).toBeGreaterThanOrEqual(38)
		expect(files.some(f => f.startsWith('icons/'))).toBe(false)
	})
})
