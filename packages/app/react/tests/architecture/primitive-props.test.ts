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
 * POR QUE AQUI E NÃO NO DETECTOR: `scripts/detectors/component-props.ts` varre bp-20 repo-wide e
 * EXCLUI `/ui/` de propósito (l.51, com o docblock dizendo "excluding ui/ primitives"), e o predicado
 * dele (CP-01) só dispara em raiz JSX minúscula — o que deixaria passar `ConfirmDialog`, cuja raiz é
 * `<DialogContent>`. Esta rail é o complemento no território que o detector recusa, com um predicado
 * mais forte: a DECLARAÇÃO de props é que precisa referenciar o vocabulário, não a raiz.
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

	it('o escopo é o glob do registry — um nível, sem icons/', async () => {
		const files = await primitiveFiles()
		expect(files.length).toBeGreaterThanOrEqual(38)
		expect(files.some(f => f.startsWith('icons/'))).toBe(false)
	})
})
