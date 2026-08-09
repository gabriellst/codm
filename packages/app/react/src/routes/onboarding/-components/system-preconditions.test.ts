import { describe, expect, it } from 'bun:test'
import { SYSTEM_PRECONDITION_IDS } from '@/services'
import { SYSTEM_PRECONDITION_MODULES } from './system-preconditions'

/**
 * AC-5 — o mapa é EXAUSTIVO sobre o union de ids.
 *
 * A garantia dura é de tipo: `Record<SystemPreconditionId, …>` faz um id sem entrada virar erro de `tsc`,
 * não bug em runtime, e é por isso que o mapa é um Record e não um `Partial` com fallback. Este
 * caso guarda o outro lado — que ninguém acrescente ao mapa uma chave que não é um id (o que
 * compila, e viraria um cartão que nunca renderiza).
 */
describe('SYSTEM_PRECONDITION_MODULES', () => {
	it('AC-5: tem exatamente uma entrada por id conhecido', () => {
		expect(Object.keys(SYSTEM_PRECONDITION_MODULES).sort()).toEqual([...SYSTEM_PRECONDITION_IDS].sort())
	})

	it('cada entrada se declara com o próprio id — o mapa e o módulo não podem discordar', () => {
		for (const [key, module] of Object.entries(SYSTEM_PRECONDITION_MODULES)) {
			expect(module.id).toBe(key)
		}
	})
})
