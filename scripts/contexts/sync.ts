/**
 * O GERADOR das uniões de contexto — `bun contexts:sync` escreve, `bun contexts:check` vigia.
 *
 * ── por que as uniões saem LITERAIS, e não `keyof typeof CONTEXTS` ───────────────────────────────
 * Porque cada `<ctx>/context.ts` vai se restringir por `ContextId` (via o alias amarrado em
 * `src/shared/context.ts`), e o agregado é montado importando esses mesmos arquivos. Se a união
 * fosse derivada do agregado, cada declaração se restringiria por um tipo derivado dela própria e o
 * `tsc` acusaria inferência circular. Emitir a união literal corta o laço na raiz — e é mais uma
 * razão para o agregado ser GERADO em vez de inferido.
 *
 * ── por que o destino é CONTRACTS, e não `src/` ──────────────────────────────────────────────────
 * Porque identidade de contexto é LÍNGUA-NEUTRA, e quem precisa dela não é só o TS. O
 * `packages/contracts/src/contexts/namespaces.ts` ao lado — a lista que colapsa `CONTEXTS.pgSchema` +
 * `FOREIGN_PGSCHEMAS` + `PENDING_PGSCHEMAS` — tem de tipar `owner` contra CONTEXTO ∪ WORKSPACE, e
 * contracts não pode importar de `api/typescript/src` sem inverter a dependência. Emitir aqui
 * resolve isso sem segunda cópia: o `src/` consome pelo subpath `@codm/contracts/context-ids`.
 *
 * ── por que o arquivo emitido não importa nada ───────────────────────────────────────────────────
 * Ele é o topo da pilha: ids (tipos, zero imports) → manifesto (dado inerte) → composição (runtime,
 * tsyringe). Um import aqui derrubaria a garantia inteira.
 *
 * ── nome do gate ─────────────────────────────────────────────────────────────────────────────────
 * `contexts:check`, e não `sync:check`: este último já existe e é o trem de sync fork↔pai
 * (`scripts/sync/check.ts`), concern diferente. A substância do falseador é a mesma — derivado
 * editado à mão fica VERMELHO.
 *
 * FONTE (desde a DC2): o conjunto de `src/<ctx>/context.ts`. A PASTA É O SPINE — um diretório com
 * `context.ts` É um contexto, e não há lista central para alguém esquecer de editar. Esquecer o
 * arquivo significa que o contexto não existe, que é a única forma de esquecimento que se percebe.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type LoadedContext, loadContexts, renderComposition, renderContexts, renderRegistries } from './aggregate'

const OUT = join(import.meta.dir, '../../packages/contracts/src/contexts/context-ids.generated.ts')

/**
 * Os ids, a partir dos contextos carregados. A DC2 trocou a FONTE — antes era `Object.keys(CONTEXTS)`
 * de uma lista central; agora é o conjunto de pastas que têm `context.ts`. A assinatura passou a
 * receber o que já foi carregado em vez de carregar de novo: um só `import()` por execução.
 */
export const contextIds = (contexts: readonly LoadedContext[]): string[] => contexts.map(c => c.id).sort()

/**
 * O render CRU. Não use direto — use `renderIdsFormatted`.
 *
 * A saída passa pelo biome antes de ir a disco, e a razão é medida: sem isso, o `--write` do
 * lint-staged reformatava o arquivo gerado no pre-commit (colapsando a união multi-linha em uma
 * linha só, porque cabe na largura) e a PROVA DIFF-ZERO ficava vermelha em TODO commit. Um gerador
 * que não fala a língua do formatador do repo briga com ele para sempre.
 */
export function renderIds(ids: readonly string[]): string {
	const union = ids.map(id => `\t| '${id}'`).join('\n')
	return `// GERADO por \`bun contexts:sync\` — NÃO EDITE. O gate é \`bun contexts:check\`.
//
// União LITERAL de propósito: cada \`<ctx>/context.ts\` se restringe por este tipo, e o agregado é
// montado importando esses mesmos arquivos. Derivar de \`keyof typeof CONTEXTS\` faria cada
// declaração se restringir por um tipo derivado dela própria — inferência circular.
//
// ZERO imports, e isso é contrato: este arquivo é o topo da pilha (ids → manifesto → composição).
// Mora em contracts porque identidade de contexto é LÍNGUA-NEUTRA: o \`namespaces.ts\` ao lado tipa
// \`owner\` contra CONTEXTO ∪ WORKSPACE, e contracts não pode importar de \`api/typescript/src\`.

/** Identidade de pasta/import — casa com \`src/<module>/\` exatamente. */
export type ContextId =
${union}
`
}

/**
 * O RENDER CANÔNICO de qualquer derivado: o cru, passado pelo formatador do repo.
 *
 * A razão é medida, e vale para todos: sem isto, o `--write` do lint-staged reformatava o arquivo
 * gerado no pre-commit e a PROVA DIFF-ZERO ficava vermelha em TODO commit. Um gerador que não fala a
 * língua do formatador do repo briga com ele para sempre.
 */
export async function formatted(source: string, filename: string): Promise<string> {
	const proc = Bun.spawn(['bun', 'x', 'biome', 'format', `--stdin-file-path=${filename}`], {
		stdin: new TextEncoder().encode(source),
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const out = await new Response(proc.stdout).text()
	if ((await proc.exited) !== 0) throw new Error(`biome format falhou em ${filename}: ${await new Response(proc.stderr).text()}`)
	return out
}

/** O render canônico das uniões. É este que vai a disco e contra o qual o `--check` compara. */
export const renderIdsFormatted = (ids: readonly string[]): Promise<string> => formatted(renderIds(ids), 'context-ids.generated.ts')

/** Um derivado: onde mora e como se produz. Acrescentar um é uma linha. */
interface Derived {
	readonly path: string
	render(): Promise<string>
}

const API_SRC = join(import.meta.dir, '../../packages/api/typescript/src')
/** Os agregados derivados NÃO são código de contexto: saíram de `src/` para que a regra "toda pasta de topo em `src/` é um contexto" volte a ser verdade sem exceção. */
const API_GENERATED = join(import.meta.dir, '../../packages/api/typescript/generated')

const derived = async (): Promise<Derived[]> => {
	const contexts = await loadContexts()
	return [
		{ path: OUT, render: () => renderIdsFormatted(contextIds(contexts)) },
		{ path: join(API_GENERATED, 'contexts.generated.ts'), render: () => formatted(renderContexts(contexts), 'contexts.generated.ts') },
		{
			path: join(API_GENERATED, 'composition.generated.ts'),
			render: () => formatted(renderComposition(contexts), 'composition.generated.ts'),
		},
		{
			path: join(API_GENERATED, 'registries.generated.ts'),
			render: () => formatted(renderRegistries(contexts), 'registries.generated.ts'),
		},
	]
}

async function main(): Promise<void> {
	const check = process.argv.includes('--check')
	const targets = await derived()
	let stale = 0

	for (const target of targets) {
		const rendered = await target.render()

		if (!check) {
			writeFileSync(target.path, rendered)
			continue
		}

		if (!existsSync(target.path)) {
			console.error(`❌ contexts:check — ${target.path} não existe. Rode \`bun contexts:sync\`.`)
			stale++
			continue
		}

		if (readFileSync(target.path, 'utf8') !== rendered) {
			console.error(`❌ contexts:check — DEFASADO ou editado à mão: ${target.path}`)
			stale++
		}
	}

	if (stale > 0) {
		console.error('   Estes arquivos são derivados dos `src/<ctx>/context.ts`. Edite a FONTE e rode `bun contexts:sync`.')
		process.exit(1)
	}

	console.log(`✅ contexts:${check ? 'check' : 'sync'} — ${targets.length} derivados em dia`)
}

if (import.meta.main) await main()
