import { describe, expect, it } from 'bun:test'
import * as testing from '../support/testing'
import { CONTEXT_CONSTANTS, CONTEXT_GIVENS } from '@generated/contexts.generated'

/**
 * FALSIFIABLE RUNTIME COMPANION to the compile-time freshness gate (spec Decision 9 FALLBACK — see
 * `../../testing.d.ts`'s docblock and the `satisfies TestingSurface` check at the bottom of
 * `../support/testing.ts`, which `bun x tsc -p tsconfig.build.json --noEmit` exercises on every
 * run: if a given's SIGNATURE drifts from the committed contract, that line goes red).
 *
 * `tsc` alone cannot catch the other half of drift: a NEW export added to `testing.ts` and never
 * added to the exported catalog below, or a name silently removed — nothing forces a human to
 * touch this file when they touch that one, and TypeScript's `satisfies` on an object literal only
 * demands the properties the target TYPE declares, so a stray extra export on the runtime module
 * would sail through unnoticed by `tsc` alone. This test pins the exact NAME SET (spec AC-5): the
 * 16 bare `givenX` helpers + `GIVEN_MENTION_TAG` + `startIntegrationBackend` — never the deprecated
 * `createGivenHelpers` facade (TST-18), which does not enter this public surface.
 *
 * Importing `../support/testing` here is cheap and side-effect-free for this purpose: nothing at
 * module top level calls `start()` — it only runs inside `startIntegrationBackend()`'s lazy
 * `boot()`, which this file never invokes. No server, no database, no network. Its ONE top-level
 * side effect is `./support/harnessDataDir`'s `CODM_DATA_DIR` assignment, which the `bun test`
 * preload (`tests/setup.ts`) has already performed by the time any suite loads.
 *
 * T7 grew the harness a `services` OPTION (co-tenant subprocesses over the shared SQLite file) and
 * an `IntegrationBackend.services` field, but NOT a new name: `IntegrationBackendOptions` is a type
 * (erased at runtime, so it cannot appear in `Object.keys`), and the machinery behind it
 * (`support/testBoot.ts`, `support/harnessDataDir.ts`) is deliberately NOT re-exported — the
 * `/testing` subpath is a catalog of things a consumer composes with, and a recipe runner is not
 * one of them. So the name set below is unchanged BY DESIGN; if a future change adds a runtime
 * export, this is the file that must grow with it.
 */
/**
 * O CATÁLOGO, DERIVADO das declarações (F3/T5) — antes era esta mesma lista escrita à mão.
 *
 * Cada contexto declara os seus `given*` no próprio `context.ts` (`ContextDecl.givens`), e o
 * agregado `CONTEXT_GIVENS` os junta. O ganho não é economizar digitação: é que os nomes passam a
 * SABER de quem são. Enquanto a lista era plana, o stamp do `create-template` não tinha como podar
 * os givens de um contexto removido — o fork ficava com um catálogo prometendo helpers de um
 * contexto que já não existe.
 *
 * `startIntegrationBackend` entra à mão e não vem do agregado, de propósito: ele não é um given de
 * contexto nenhum — é o BOOT do harness, a única coisa aqui que não semeia estado. Declará-lo em
 * `shared.givens` seria dizer uma inverdade sobre o que ele é para economizar uma linha.
 *
 * A ORDEM não importa (a asserção lá embaixo compara conjuntos ordenados), mas a COBERTURA sim: um
 * export novo em `testing.ts` que ninguém declare em nenhum `context.ts` reprova aqui, que é
 * exatamente a metade da deriva que o `tsc` não pega.
 */
// O catálogo é a UNIÃO das duas superfícies: as funções `given*` e as CONSTANTES. Elas se separaram
// na declaração (um `const` e uma `function` não se escrevem igual no `testing.d.ts`), e este rail
// tem de somar as duas — senão a separação teria ENCOLHIDO a cobertura em silêncio, que é o modo de
// falha que esta sessão passou o dia encontrando.
const CATALOG = ['startIntegrationBackend', ...Object.values(CONTEXT_GIVENS).flat(), ...Object.values(CONTEXT_CONSTANTS).flat()] as const

describe('/testing exporta o catálogo completo, exatamente (spec AC-5, D9 fallback)', () => {
	it('todo nome do catálogo está presente', () => {
		const actual = testing as Record<string, unknown>
		for (const name of CATALOG) {
			expect(actual[name], `esperava ${name} exportado por tests/support/testing.ts`).toBeDefined()
		}
	})

	/**
	 * FALSEADOR (spec AC-5): remover um nome de CATALOG acima (ou adicionar um export novo em
	 * `testing.ts` sem espelhar aqui) vira este teste vermelho — measured, não assumido: comentar
	 * `'givenStop',` acima e rodar a suíte falha com o diff do `toEqual`; descomentar volta ao verde.
	 */
	it('nenhum export além do catálogo — a facade deprecated não vaza', () => {
		const actual = Object.keys(testing).sort()
		expect(actual).toEqual([...CATALOG].sort())
	})

	it('createGivenHelpers (a facade @deprecated, TST-18) não é exportado', () => {
		expect('createGivenHelpers' in testing).toBe(false)
	})
})
