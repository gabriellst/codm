// A cadência de um job pode morar no próprio job (spec DC0, AC-8 / F-4).
//
// `resolveJobCadence` é pura de propósito: dá testemunha do dispatch sem montar contexto, resolver
// container nem tocar em fila. A migração dos jobs reais para `static repeat` é da DC2 — aqui só se
// prova que o kernel sabe ler as duas formas e qual delas vence.
import { describe, expect, it } from 'bun:test'
import { type JobDefinition, resolveJobCadence } from './BoundedContext'

class ComEstatico {
	static repeat = { every: 60_000 }
}
class SemEstatico {}

const job = (handler: unknown, repeat?: JobDefinition['repeat']): JobDefinition =>
	({ handler, ...(repeat ? { repeat } : {}) }) as JobDefinition

describe('resolveJobCadence — a cadência pode morar no job', () => {
	it('AC-8: usa o `static repeat` do handler quando o JobDefinition não traz `repeat`', () => {
		expect(resolveJobCadence(job(ComEstatico))).toEqual({ every: 60_000 })
	})

	it('AC-8: o `repeat` explícito do JobDefinition VENCE o estático', () => {
		expect(resolveJobCadence(job(ComEstatico, { every: 5_000 }))).toEqual({ every: 5_000 })
	})

	it('F-4: sem cadência em lugar nenhum, devolve undefined — quem chama decide', () => {
		expect(resolveJobCadence(job(SemEstatico))).toBeUndefined()
	})
})
