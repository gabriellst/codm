import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * TODA FERRAMENTA MCP GERADA CORRESPONDE A UMA OPERAÇÃO DA SPEC — nos dois sentidos.
 *
 * ── O BURACO QUE ISTO FECHA ──────────────────────────────────────────────────────────────────────
 * O `check:generated` compara o que o gerador ESCREVE contra o que está commitado. Um arquivo
 * commitado que o gerador não escreve mais não produz diferença nenhuma: o kubb roda com
 * `clean: false` (`packages/client/generators/typescript.ts`), então não o remove, e o git portanto
 * não acusa nada. É um gate de MÃO ÚNICA, e a direção que falta é exatamente a que a deriva usa.
 *
 * Medido em 2026-08-17: cinco ferramentas de `owner` (createOwner, setActiveOwner, enableOwner,
 * disableOwner, updateOwnerSettings) viviam em `mcp/scopes/system/` com ZERO importadores e ZERO
 * rotas correspondentes — `owner` é cloud-only desde o ADR 0001, e o daemon local não a monta. O
 * `check:generated` dizia "in sync" o tempo todo. Só acusou quando foram REMOVIDAS.
 *
 * O `clean: false` é deliberado e não vai mudar: há um shim de auth ESCRITO À MÃO dentro da mesma
 * árvore gerada (ver o docblock do layout MCP no gerador), então limpar apagaria código que ninguém
 * regenera. O preço é que saída obsoleta nunca sai sozinha — e é esse preço que este rail cobra.
 *
 * ── POR QUE NOS DOIS SENTIDOS ────────────────────────────────────────────────────────────────────
 * ÓRFÃO (arquivo sem operação) é o defeito medido acima: uma ferramenta que o modelo pode ver e
 * chamar, apontando para uma rota que não existe mais.
 * FALTANDO (operação sem arquivo) é o gêmeo silencioso: um controller declara `mcpScopes`, ninguém
 * regenera, e a ferramenta prometida simplesmente não existe. Nenhum dos dois falha em runtime até
 * alguém tentar usar.
 */
describe('as ferramentas MCP geradas batem com a spec, nos dois sentidos', () => {
	const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
	const scopesDir = join(repoRoot, 'packages/client/dist/typescript/src/typescript/mcp/scopes')
	const specPath = join(repoRoot, 'packages/api/typescript/public/docs/openapi.json')

	/** Infra do próprio gerador, não ferramentas — o barril, o transporte e o servidor por escopo. */
	const INFRA = new Set(['index.ts', '_http.ts', 'server.ts'])

	/** `operationId` é PascalCase na spec e camelCase no arquivo emitido — a mesma operação. */
	const toFileName = (operationId: string) => operationId.charAt(0).toLowerCase() + operationId.slice(1)

	/** (escopo → operações) DECLARADAS pelos controllers, lidas da spec emitida. */
	function declaredByScope(): Map<string, Set<string>> {
		const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
			paths: Record<string, Record<string, { operationId?: string; 'x-mcp-scope'?: unknown }>>
		}
		const out = new Map<string, Set<string>>()
		for (const pathItem of Object.values(spec.paths)) {
			for (const op of Object.values(pathItem)) {
				const scopes = op?.['x-mcp-scope']
				if (!Array.isArray(scopes) || op.operationId === undefined) continue
				for (const raw of scopes) {
					// A spec escreve `mcp:system`; o diretório é `system`.
					const scope = String(raw).replace(/^mcp:/, '')
					if (!out.has(scope)) out.set(scope, new Set())
					out.get(scope)?.add(toFileName(op.operationId))
				}
			}
		}
		return out
	}

	/** (escopo → arquivos de ferramenta) que EXISTEM em disco. */
	function emittedByScope(): Map<string, Set<string>> {
		const out = new Map<string, Set<string>>()
		for (const scope of readdirSync(scopesDir)) {
			const files = readdirSync(join(scopesDir, scope))
				.filter(file => file.endsWith('.ts') && !INFRA.has(file))
				.map(file => file.replace(/\.ts$/, ''))
			out.set(scope, new Set(files))
		}
		return out
	}

	test('MCP-01: nenhuma ferramenta ÓRFÃ — todo arquivo emitido tem operação na spec', () => {
		expect(existsSync(scopesDir), 'a árvore MCP gerada existe').toBe(true)
		const declared = declaredByScope()
		const orphans: string[] = []

		for (const [scope, files] of emittedByScope()) {
			const ops = declared.get(scope) ?? new Set<string>()
			for (const file of files) if (!ops.has(file)) orphans.push(`${scope}/${file}.ts`)
		}

		expect(
			orphans,
			'ferramentas MCP apontando para rotas que não existem — o kubb não as remove (clean: false), ' + 'então some-as à mão e regenere',
		).toEqual([])
	})

	test('MCP-02: nenhuma ferramenta FALTANDO — toda operação com escopo foi emitida', () => {
		const emitted = emittedByScope()
		const missing: string[] = []

		for (const [scope, ops] of declaredByScope()) {
			const files = emitted.get(scope) ?? new Set<string>()
			for (const op of ops) if (!files.has(op)) missing.push(`${scope}/${op}.ts`)
		}

		expect(missing, 'controllers declaram estes escopos MCP e a ferramenta não foi emitida — rode `bun sdk`').toEqual([])
	})

	test('MCP-03: os escopos em disco são exatamente os declarados — nem a mais, nem a menos', () => {
		// Um diretório de escopo inteiro sobrando é a mesma doença dos órfãos, um nível acima: ele
		// sobrevive a `clean: false` do mesmo jeito, e um `for` sobre o disco nunca o acusaria.
		expect([...emittedByScope().keys()].sort()).toEqual([...declaredByScope().keys()].sort())
	})
})
