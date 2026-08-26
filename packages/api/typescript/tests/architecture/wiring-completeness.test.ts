import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTEXTS } from '@generated/contexts.generated'

/**
 * Wiring-completeness guard — kills the "orphan artifact" class: a file that exists, compiles and
 * passes its unit tests but is NEVER REGISTERED, so it silently does nothing at runtime. This is
 * the exact shape of the worst bug of the de-template reorg (13 of 18 billing handlers existed but
 * were not exported from the handlers barrel — a paid invoice never activated its subscription) and
 * of CMPL-06/07/11/12 from the completeness-reinforcement plan.
 *
 * The registration surfaces are BARRELS/ARRAYS by design (bundler-friendly), i.e. inevitable
 * redeclarations — so they are GATED, not derived:
 *   WIRE-01 — every file in src/<ctx>/handlers/ is exported from internal.ts or external.ts.
 *   WIRE-02 — every class declaring `static readonly repeat` is exported from <ctx>/jobs.ts.
 *   WIRE-03 — every controller class (`extends Controller`) is exported from controllers/index.ts.
 * (CMPL-06 — registry present for all 3 envs per context — became a COMPILE error in F1a.2 via
 * `satisfies Record<ContextModule, InstanceRegistry>`; no runtime rail needed.)
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const MODULES = Object.keys(CONTEXTS)

const tsFiles = (dir: string): string[] =>
	existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')) : []

interface Violation {
	context: string
	artifact: string
	problem: string
}

/**
 * O SUJEITO VARRIDO, contado — e é a lição desta sessão virada mecanismo.
 *
 * WIRE-01 e WIRE-02 ficaram VERDES vendo zero arquivos, cada um por uma renomeação que ninguém
 * propagou até aqui (`*Handler.ts` → nomes por intenção; `<ctx>/jobs/` → `<ctx>/jobs.ts`). Consertar
 * os dois casos não vale nada se a TERCEIRA renomeação recriar o buraco em silêncio.
 *
 * Então cada scan devolve quantos sujeitos examinou, e cada teste cobra que esse número seja > 0. Um
 * rail que perdeu o sujeito passa a REPROVAR dizendo que perdeu, em vez de passar dizendo nada.
 * O `job-cadence.test.ts` (JOB-01) já fazia isso — aqui a prática vira regra dos três.
 */
interface Scan {
	violations: Violation[]
	scanned: number
}

function scanHandlers(root: string): Scan {
	const violations: Violation[] = []
	let scanned = 0
	for (const ctx of MODULES) {
		const dir = join(root, ctx, 'handlers')
		// O sujeito é QUALQUER arquivo de `handlers/` que não seja barril nem teste — não só `*Handler.ts`.
		//
		// O filtro era `f.endsWith('Handler.ts')`, e MEDIDO em 2026-08-17 ele casava **zero** arquivos:
		// os 11 handlers reais deste repo são nomeados por INTENÇÃO (`ConsumeInboundMessage.ts`,
		// `DeliverOrchestratorReply.ts`), convenção que mudou e ninguém propagou para cá. O rail ficava
		// verde vendo nada, e os 11 seguiam desguardados.
		//
		// Falsificado antes do conserto: um handler novo, NÃO exportado do barril, passava impune —
		// 4 pass / 0 fail. É a doença que o §1 do plano descreve, na forma mais silenciosa: não um gate
		// vermelho que para de informar, um gate VERDE que nunca informou.
		const BARREL_FILES = new Set(['internal.ts', 'external.ts', 'commands.ts'])
		const files = tsFiles(dir).filter(f => !BARREL_FILES.has(f) && !f.endsWith('.test.ts'))
		if (files.length === 0) continue
		const barrels = ['internal.ts', 'external.ts', 'commands.ts']
			.map(b => join(dir, b))
			.filter(existsSync)
			.map(b => readFileSync(b, 'utf8'))
			.join('\n')
		for (const file of files) {
			scanned++
			const name = file.replace(/\.ts$/, '')
			if (!new RegExp(`\\b${name}\\b`).test(barrels)) {
				violations.push({
					context: ctx,
					artifact: `handlers/${file}`,
					problem: 'not exported from internal.ts/external.ts — the handler is DEAD wiring',
				})
			}
		}
	}
	return { violations, scanned }
}

/**
 * WIRE-02 pergunta "que job existe e nunca agenda?" — e até 2026-08-17 ela perguntava isso a uma
 * forma MORTA: cobrava `*Job.ts` dentro de `<ctx>/jobs/` referenciado em `<ctx>/index.ts`. Medido:
 * zero arquivos `*Job.ts`, zero `<ctx>/index.ts` (a DC2 apagou os dois) e TRÊS `<ctx>/jobs.ts`, que
 * é a forma que o gerador lê hoje. O rail passava por AUSÊNCIA DO PRÓPRIO ASSUNTO.
 *
 * Ele não podia simplesmente sair (era candidato a poda na F6): sair sem substituto deixaria os três
 * jobs reais desguardados. Então a pergunta continua e o SUJEITO é reancorado.
 *
 * O novo sujeito é o MARCADOR ESTRUTURAL, não a convenção de nome — que é exatamente o defeito que
 * cegou o WIRE-01 logo acima. Um job se declara por `static readonly repeat`, e é isso que o runtime
 * lê (`resolveJobCadence`: `job.repeat ?? handler.repeat`). Um arquivo com esse marcador que não
 * chega ao barril `<ctx>/jobs.ts` não entra no manifesto e NUNCA AGENDA — silenciosamente, porque
 * compila, testa e não roda.
 */
const JOB_MARKER = /static\s+readonly\s+repeat\b/

/** Recursivo: os jobs moram em `<ctx>/usecases/`, não numa pasta `jobs/` própria. */
function tsFilesDeep(dir: string, prefix = ''): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name
		if (e.isDirectory()) out.push(...tsFilesDeep(join(dir, e.name), rel))
		else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(rel)
	}
	return out
}

function scanJobs(root: string): Scan {
	const violations: Violation[] = []
	let scanned = 0
	for (const ctx of MODULES) {
		const ctxDir = join(root, ctx)
		if (!existsSync(ctxDir)) continue
		const barrelPath = join(ctxDir, 'jobs.ts')
		const barrel = existsSync(barrelPath) ? readFileSync(barrelPath, 'utf8') : ''
		for (const rel of tsFilesDeep(ctxDir)) {
			if (rel === 'jobs.ts') continue
			const source = readFileSync(join(ctxDir, rel), 'utf8')
			for (const m of source.matchAll(/export class (\w+)/g)) {
				const cls = m[1] ?? ''
				// O marcador tem de estar NESTA classe: corta a fonte no `export class` seguinte.
				const from = m.index ?? 0
				const nextIdx = source.slice(from + 1).search(/\bexport class \w+/)
				const body = nextIdx === -1 ? source.slice(from) : source.slice(from, from + 1 + nextIdx)
				if (!JOB_MARKER.test(body)) continue
				scanned++
				if (!new RegExp(`\\b${cls}\\b`).test(barrel)) {
					violations.push({
						context: ctx,
						artifact: `${rel}#${cls}`,
						problem: `declares 'static readonly repeat' but is not exported from ${ctx}/jobs.ts — the job NEVER schedules`,
					})
				}
			}
		}
	}
	return { violations, scanned }
}

function scanControllers(root: string): Scan {
	const violations: Violation[] = []
	let scanned = 0
	for (const ctx of MODULES) {
		const dir = join(root, ctx, 'controllers')
		const files = tsFiles(dir).filter(f => f !== 'index.ts')
		if (files.length === 0) continue
		const barrelPath = join(dir, 'index.ts')
		const barrel = existsSync(barrelPath) ? readFileSync(barrelPath, 'utf8') : ''
		for (const file of files) {
			const source = readFileSync(join(dir, file), 'utf8')
			for (const m of source.matchAll(/export class (\w+) extends Controller\b/g)) {
				const cls = m[1] ?? ''
				scanned++
				if (!new RegExp(`\\b${cls}\\b`).test(barrel)) {
					violations.push({
						context: ctx,
						artifact: `controllers/${file}#${cls}`,
						problem: 'controller class not exported from controllers/index.ts — no route is registered',
					})
				}
			}
		}
	}
	return { violations, scanned }
}

const report = (v: Violation[]) => v.map(x => `  ${x.context}/${x.artifact}  →  ${x.problem}`).join('\n')

/** A mensagem do rail que perdeu o próprio sujeito — ela tem de dizer o que fazer, não só que zerou. */
const NADA_A_VER = (qual: string, sujeito: string) =>
	`WIRE: o scan de ${qual} examinou ZERO sujeitos (${sujeito}), então este rail não está medindo nada. ` +
	`Isso quase certamente é uma RENOMEAÇÃO que não chegou até aqui — foi assim que WIRE-01 e WIRE-02 ` +
	`ficaram verdes vendo zero arquivos até 2026-08-17. Reancore o filtro no marcador estrutural que o ` +
	`runtime lê, NUNCA numa convenção de nome de arquivo.`

describe('wiring-completeness (an artifact that exists MUST be registered — orphan files are dead wiring)', () => {
	test('WIRE-01: every handler file is exported from its context handler barrel', () => {
		const { violations, scanned } = scanHandlers(API_SRC)
		expect(scanned, NADA_A_VER('handlers', 'src/<ctx>/handlers/')).toBeGreaterThan(0)
		expect(
			violations.length,
			`Orphan handler(s) — export from internal.ts (domain events) or external.ts (integration events):\n${report(violations)}`,
		).toBe(0)
	})

	test("WIRE-02: every class with 'static readonly repeat' is exported from its context jobs.ts", () => {
		const { violations, scanned } = scanJobs(API_SRC)
		expect(scanned, NADA_A_VER('jobs', 'classes com `static readonly repeat`')).toBeGreaterThan(0)
		expect(
			violations.length,
			`Orphan job(s) — export from <ctx>/jobs.ts so the generator puts them in the manifest:\n${report(violations)}`,
		).toBe(0)
	})

	test('WIRE-03: every controller class is exported from its controllers barrel', () => {
		const { violations, scanned } = scanControllers(API_SRC)
		expect(scanned, NADA_A_VER('controllers', 'classes `extends Controller`')).toBeGreaterThan(0)
		expect(
			violations.length,
			`Orphan controller(s) — export from controllers/index.ts so the router registers the route:\n${report(violations)}`,
		).toBe(0)
	})

	// Negative fixture — proves each scan catches an orphan (temp dir, not the real tree).
	test('fixture: an unexported handler, job and controller are all flagged', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'wiring-fixture-'))
		const write = (p: string, c: string) => {
			mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true })
			writeFileSync(p, c)
		}
		const CTX = MODULES[0] as string
		try {
			// The fixture needs a name that MODULES contains, and it takes one FROM MODULES instead of
			// spelling it. It used to hard-code 'owner': a fork that prunes that context would have kept
			// compiling, then failed HERE — MODULES no longer contains the name, the scan returns [], and
			// the assertions below go red for a reason that has nothing to do with the code under test.
			// A rail must not presuppose which contexts a product happens to have.
			write(join(tmpRoot, CTX, 'handlers', 'GhostHandler.ts'), 'export class GhostHandler {}\n')
			write(join(tmpRoot, CTX, 'handlers', 'internal.ts'), "export { OtherHandler } from './OtherHandler'\n")
			// Job órfão na forma ATUAL: mora em `usecases/`, carrega o marcador, e o barril não o exporta.
			// O segundo arquivo prova que o scan não casa por proximidade — `PlainUseCase` não tem o
			// marcador e NÃO pode ser acusado, mesmo estando igualmente fora do barril.
			write(join(tmpRoot, CTX, 'usecases', 'GhostSweep.ts'), 'export class GhostSweep {\n\tstatic readonly repeat = { every: 1000 }\n}\n')
			write(join(tmpRoot, CTX, 'usecases', 'PlainUseCase.ts'), 'export class PlainUseCase {}\n')
			write(join(tmpRoot, CTX, 'jobs.ts'), "export { SomeOtherJob } from './usecases/SomeOtherJob'\n")
			write(join(tmpRoot, CTX, 'controllers', 'Ghost.ts'), 'export class GhostController extends Controller {}\n')
			write(join(tmpRoot, CTX, 'controllers', 'index.ts'), '// empty barrel\n')
			expect(scanHandlers(tmpRoot).violations.map(v => v.artifact)).toEqual(['handlers/GhostHandler.ts'])
			expect(scanJobs(tmpRoot).violations.map(v => v.artifact)).toEqual(['usecases/GhostSweep.ts#GhostSweep'])
			expect(scanControllers(tmpRoot).violations.map(v => v.artifact)).toEqual(['controllers/Ghost.ts#GhostController'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
