import { describe, expect, it } from 'bun:test'
import * as testing from '../support/testing'

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
 * 15 bare `givenX` helpers + `GIVEN_MENTION_TAG` + `startIntegrationBackend` — never the deprecated
 * `createGivenHelpers` facade (TST-18), which does not enter this public surface.
 *
 * Importing `../support/testing` here is cheap and side-effect-free for this purpose: nothing at
 * module top level calls `start()` — it only runs inside `startIntegrationBackend()`'s lazy
 * `boot()`, which this file never invokes. No server, no database, no network.
 */
const CATALOG = [
	'startIntegrationBackend',
	'givenUser',
	'givenAccount',
	'givenUserWithAccount',
	'givenActiveSession',
	'givenOwner',
	'givenOwnerWithResponsible',
	'givenWorkspace',
	'givenThread',
	'GIVEN_MENTION_TAG',
	'givenChannel',
	'givenRemote',
	'givenRemoteMembership',
	'givenIssue',
	'givenStop',
	'givenDomainEvent',
	'givenUserProfile',
] as const

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
