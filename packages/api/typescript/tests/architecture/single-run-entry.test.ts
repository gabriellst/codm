// packages/api/typescript/tests/architecture/single-run-entry.test.ts — COMPLETE final file
import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

/**
 * Single-run-entry guard — "um run por issue" tem UMA trava, e ela é o lease por alvo do mailbox.
 *
 * Até 2026-08-05 eram duas: o lease durável (`claimNext` recusa um alvo com lease vivo) e um
 * `Set<string>` em memória dentro de `AgentStreamRegistry` (`beginSession`/`endSession`). Duas travas
 * para uma invariante divergem, e divergiram: uma issue ficou `WORKING` por 2h38 porque a entrada em
 * memória sobreviveu a um turno que retornou, enquanto o lease estava limpo. O mecanismo do vazamento
 * nunca foi explicado — o que é exatamente o argumento para não haver a segunda trava, e a razão de
 * este rail existir depois da remoção em vez de um comentário pedindo cuidado (README: degrau
 * `eliminate` acima de `document`).
 *
 * TRÊS famílias, cada uma com seu conjunto permitido:
 *
 *   1. ENTRADA ÚNICA — só dois módulos importam o símbolo `RunIssueTurn`: o dispatcher, que é quem
 *      segura o lease, e a porta E2E, que existe para disparar um turno num teste. Um terceiro
 *      importador seria um caminho até o turno SEM lease, e é a única forma de dois runs voltarem a
 *      disputar uma issue. O matcher é a FORMA DE IMPORT (`import { … RunIssueTurn … } from`), não o
 *      nome nu: `RunIssueTurn` aparece em dezenas de docstrings por todo o contexto e essa prosa tem
 *      de continuar escrevível. Por consequência o barrel `usecases/index.ts` não precisa de exceção
 *      — ele usa `export { … } from`, que não casa.
 *
 *   2. O GUARD SUMIU — nenhum arquivo de `src/` menciona `beginSession` ou `endSession`. Espelha o
 *      `pty-isolation`'s "the PTY engine is GONE, not merely quarantined": manter o rail depois da
 *      deleção é o que impede um futuro "só um Set rapidinho" de reintroduzir a divergência.
 *      `activeSessions` NÃO entra nesta lista: `ui/usecases/GetHomeDashboard.ts` tem um campo de DTO
 *      com esse nome, legítimo e sem relação.
 *
 *   3. O CÓDIGO DE ERRO SUMIU — `TERMINAL_ALREADY_RUNNING` não existe mais em `src/`. Ele era público
 *      (HTTP 409, chave i18n, membro do `ErrorCode` da SDK); a metade fora de `src/` é coberta pelo
 *      `error-coherence` e pelo `i18n-coherence`.
 *
 * Comentários são removidos antes do match nas famílias 2 e 3, para que um docstring que EXPLIQUE a
 * remoção não seja lido como a remoção desfeita.
 */

const SRC = join(import.meta.dir, '..', '..', 'src')

/** O separador final é load-bearing: sem ele, um diretório irmão com o mesmo prefixo herdaria a permissão. */
const ALLOWED_RUN_ISSUE_TURN_IMPORTERS = [
	join(SRC, 'agent/services/MailboxDispatcher') + sep,
	join(SRC, 'agent/controllers/TestRunIssueTurn.ts'),
]

/** `import { … RunIssueTurn … } from` em uma linha ou várias — a forma, não o nome nu. */
const RUN_ISSUE_TURN_IMPORT = /import\s+(?:type\s+)?\{[^}]*\bRunIssueTurn\b[^}]*\}\s*from/

/** Símbolos do guard removido. `activeSessions` fica de fora — ver família 2 no docstring. */
const FORBIDDEN_GUARD_REFS = ['beginSession', 'endSession']

const FORBIDDEN_ERROR_REFS = ['TERMINAL_ALREADY_RUNNING']

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) {
			if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '__fixtures__') continue
			walk(full, out)
		} else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Idêntico ao strip do `error-coherence`: prosa citando um símbolo não é o símbolo. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function importViolators(files: string[], allowed: string[]): string[] {
	return files.filter(f => {
		if (allowed.some(prefix => f.startsWith(prefix))) return false
		return RUN_ISSUE_TURN_IMPORT.test(stripComments(readFileSync(f, 'utf8')))
	})
}

function refViolators(files: string[], forbidden: string[]): string[] {
	return files.filter(f => {
		const source = stripComments(readFileSync(f, 'utf8'))
		return forbidden.some(ref => source.includes(ref))
	})
}

describe('Single-run-entry — o lease é a única trava de um run por issue', () => {
	const files = walk(SRC)

	it('sanity: o scan enxerga a árvore e os dois importadores legítimos existem', () => {
		expect(files.length).toBeGreaterThan(100)
		const allowed = files.filter(f => ALLOWED_RUN_ISSUE_TURN_IMPORTERS.some(p => f.startsWith(p)))
		expect(allowed.length).toBeGreaterThan(0)
	})

	it('só o dispatcher e a porta E2E importam RunIssueTurn — um terceiro seria um turno sem lease', () => {
		expect(importViolators(files, ALLOWED_RUN_ISSUE_TURN_IMPORTERS)).toEqual([])
	})

	it('o guard em memória SUMIU, não foi só posto de quarentena', () => {
		expect(refViolators(files, FORBIDDEN_GUARD_REFS)).toEqual([])
	})

	it('TERMINAL_ALREADY_RUNNING não existe mais — nenhum caminho pode levantá-lo', () => {
		expect(refViolators(files, FORBIDDEN_ERROR_REFS)).toEqual([])
	})

	/**
	 * Fixture negativa — sem ela, um rail que passa não prova nada: um regex quebrado passaria igual.
	 * Cada família recebe um arquivo que a viola, num diretório temporário, e o scanner tem de acusar.
	 */
	describe('fixture negativa — o scanner acusa de verdade', () => {
		it('pega um import de RunIssueTurn fora dos dois prefixos permitidos, inclusive via barrel', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-'))
			try {
				mkdirSync(join(dir, 'ui'), { recursive: true })
				const direct = join(dir, 'Direct.ts')
				const viaBarrel = join(dir, 'ui', 'ViaBarrel.ts')
				writeFileSync(direct, "import { RunIssueTurn } from '../../agent/usecases/RunIssueTurn'\nexport const a = RunIssueTurn\n")
				writeFileSync(viaBarrel, "import { RunIssueTurn } from '@agent/usecases'\nexport const b = RunIssueTurn\n")

				const found = importViolators(walk(dir), ALLOWED_RUN_ISSUE_TURN_IMPORTERS)
				expect(found).toContain(direct)
				expect(found).toContain(viaBarrel)
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})

		it('NÃO acusa um reexport de barrel nem uma menção em comentário', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-ok-'))
			try {
				const barrel = join(dir, 'index.ts')
				const prose = join(dir, 'Prose.ts')
				writeFileSync(barrel, "export { RunIssueTurn } from './RunIssueTurn'\n")
				writeFileSync(prose, '// import { RunIssueTurn } from somewhere — explicando por que NÃO se faz isso\nexport const c = 1\n')

				expect(importViolators(walk(dir), ALLOWED_RUN_ISSUE_TURN_IMPORTERS)).toEqual([])
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})

		it('pega os símbolos do guard e o código de erro removidos', () => {
			const dir = mkdtempSync(join(tmpdir(), 'single-run-entry-refs-'))
			try {
				const guard = join(dir, 'Guard.ts')
				const code = join(dir, 'Code.ts')
				writeFileSync(guard, 'export function beginSession(id: string) { return id }\n')
				writeFileSync(code, "export const e = 'TERMINAL_ALREADY_RUNNING'\n")

				const files = walk(dir)
				expect(refViolators(files, FORBIDDEN_GUARD_REFS)).toContain(guard)
				expect(refViolators(files, FORBIDDEN_ERROR_REFS)).toContain(code)
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		})
	})
})
