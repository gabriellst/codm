import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { HEALTH_CHECKS, HealthCheck, healthChecksFrom, type HealthComponentReport } from './HealthCheck'
import { HealthService } from './HealthService'

class FakeCheck extends HealthCheck {
	constructor(
		readonly name: string,
		readonly gate: boolean,
		private readonly report: HealthComponentReport,
	) {
		super()
	}
	async check(): Promise<HealthComponentReport> {
		return this.report
	}
}

const up = (gate: boolean): HealthComponentReport => ({ status: 'up', gate })
const down = (gate: boolean): HealthComponentReport => ({ status: 'down', gate, detail: 'forced' })

describe('multi-inject em tsyringe-neo — a ESPIGA (primeiro uso no repo)', () => {
	it('N register() no MESMO token voltam TODOS por resolveAll, na ordem de registro', () => {
		const c = container.createChildContainer()
		c.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('a', true, up(true)) })
		c.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('b', true, up(true)) })
		expect(c.resolveAll<HealthCheck>(HEALTH_CHECKS).map(x => x.name)).toEqual(['a', 'b'])
		// E o resolve() singular devolve o ÚLTIMO — a razão pela qual NADA resolve este token no singular.
		expect((c.resolve(HEALTH_CHECKS) as HealthCheck).name).toBe('b')
	})

	it('O TOKEN É STRING porque um token de CLASSE ABSTRATA falha em silêncio', () => {
		const c = container.createChildContainer()
		// String: lança com o nome do token.
		expect(() => c.resolveAll<HealthCheck>(HEALTH_CHECKS)).toThrow(/unregistered dependency token/)
		// Classe abstrata: NÃO lança — CONSTRÓI a abstrata e devolve uma instância sem métodos.
		// (o mesmo footgun que shared/registry.ts:174-176 documenta). Este assert existe para que
		// trocar o token por HealthCheck fique VERMELHO em vez de silenciosamente degradado.
		const ghosts = c.resolveAll<HealthCheck>(HealthCheck as never)
		expect(ghosts).toHaveLength(1)
		expect(ghosts[0]!.name).toBeUndefined()
	})

	it('container FILHO sombreia o pai — por isso todo check cai no MESMO container', () => {
		const parent = container.createChildContainer()
		parent.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('parent', true, up(true)) })
		const child = parent.createChildContainer()
		child.register(HEALTH_CHECKS, { useFactory: () => new FakeCheck('child', true, up(true)) })
		expect(child.resolveAll<HealthCheck>(HEALTH_CHECKS).map(x => x.name)).toEqual(['child'])
	})

	it('healthChecksFrom devolve [] num container sem registro nenhum (nunca lança no boot)', () => {
		expect(healthChecksFrom(container.createChildContainer())).toEqual([])
	})
})

describe('HealthService — agrega, e SÓ gate reprova', () => {
	it('todos up ⇒ ready, com um componente por check', async () => {
		const svc = new HealthService(() => [new FakeCheck('db', true, up(true)), new FakeCheck('channel', false, up(false))])
		const report = await svc.report()
		expect(report.ready).toBe(true)
		expect(Object.keys(report.components).sort()).toEqual(['channel', 'db'])
	})

	it('FALSEADOR — um check de GATE down reprova; um check de DIAGNÓSTICO down não', async () => {
		const gateDown = new HealthService(() => [new FakeCheck('db', true, down(true))])
		expect((await gateDown.report()).ready).toBe(false)

		const diagDown = new HealthService(() => [new FakeCheck('db', true, up(true)), new FakeCheck('channel', false, down(false))])
		const report = await diagDown.report()
		expect(report.ready).toBe(true)
		expect(report.components.channel!.status).toBe('down')
	})

	it('um check que LANÇA vira componente down, nunca uma exceção que escapa', async () => {
		class Exploding extends HealthCheck {
			readonly name = 'boom'
			readonly gate = true
			async check(): Promise<HealthComponentReport> {
				throw new Error('nope')
			}
		}
		const report = await new HealthService(() => [new Exploding()]).report()
		expect(report.ready).toBe(false)
		expect(report.components.boom!.detail).toContain('nope')
	})

	/**
	 * A LISTA É LIDA NO `report()`, nunca capturada na construção.
	 *
	 * O `HealthController` nasce quando o router do contexto RAIZ registra controllers — e os outros
	 * contextos só registram os SEUS checks depois, ao montarem. Uma lista capturada ali é o retrato
	 * de um container pela metade.
	 *
	 * Medido em 2026-08-15: quando a raiz deixou de carregar o merge de todos os registries (o que,
	 * por acidente, fazia tudo já estar registrado a tempo), o `mailboxDispatcher` SUMIU do relatório
	 * — o dispatcher rodava e o operador não tinha como saber. Trocar um alarme falso por um ponto
	 * cego não é conserto.
	 */
	it('vê um check registrado DEPOIS da construção — o container ainda está sendo preenchido', async () => {
		const registered: HealthCheck[] = [new FakeCheck('db', true, up(true))]
		// Um array NOVO a cada chamada, como `resolveAll` devolve. Modelar isso importa: a primeira
		// versão deste caso devolvia a MESMA referência, e aí até uma implementação que captura no
		// construtor via o `push` — o falseador ficou verde e o teste não provava nada.
		const service = new HealthService(() => [...registered])

		expect(Object.keys((await service.report()).components)).toEqual(['db'])

		// O que `BoundedContext.create` de um contexto não-raiz faz, mais tarde.
		registered.push(new FakeCheck('mailboxDispatcher', true, up(true)))

		const later = await service.report()
		expect(Object.keys(later.components), 'um check que chegou depois TEM de aparecer').toEqual(['db', 'mailboxDispatcher'])
	})
})
