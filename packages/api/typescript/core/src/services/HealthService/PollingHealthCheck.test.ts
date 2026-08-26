import { describe, expect, it } from 'bun:test'
import type { PollingService } from './HealthCheck'
import { PollingHealthCheck } from './PollingHealthCheck'

/**
 * O check resolve o serviço NA HORA DO CHECK — nunca guarda uma instância do boot.
 *
 * ── o incidente que estes casos existem para não deixar voltar ───────────────────────────────────
 * O desktop não abria. O daemon subia inteiro, as migrações aplicavam, os routers montavam, e o log
 * dizia `MailboxDispatcher started` — mas `/health` respondia 503 para sempre, com
 * `mailboxDispatcher: down — poll timer not running`. O shell Tauri espera esse endpoint ficar
 * pronto antes de renderizar o console, então ele nunca inicializava.
 *
 * A causa, medida instrumentando os dois lados com o `workerId` do dispatcher: eram DUAS INSTÂNCIAS.
 * O check via `mailbox-e650f485…` (parada); o `server.ts` iniciava `mailbox-6c002d95…`.
 *
 * E o caminho até as duas: `BoundedContext.create` aplica o registry de cada contexto no container
 * raiz, e o contexto raiz carrega o merge de todos — então o mesmo token é registrado mais de uma
 * vez. Registrar de novo um singleton DESCARTA a instância em cache do tsyringe, sem erro e sem
 * aviso. O check, construído durante a composição, ficou segurando a instância de antes.
 *
 * O sintoma é o pior tipo: cada peça relata sucesso, e só a soma está errada.
 */
describe('PollingHealthCheck — a fiação VIVA, não um retrato do boot', () => {
	/** Um serviço cujo `running` pode virar, e que pode ser SUBSTITUÍDO por outro. */
	const service = (running: boolean): PollingService => ({ running }) as PollingService

	it('PHC-01: reporta `up` quando o timer está armado', async () => {
		const check = new PollingHealthCheck('x', () => service(true))
		expect(await check.check()).toEqual({ status: 'up', gate: true })
	})

	it('PHC-02: reporta `down` NOMEANDO a causa quando não está', async () => {
		const check = new PollingHealthCheck('x', () => service(false))
		expect(await check.check()).toEqual({ status: 'down', gate: true, detail: 'poll timer not running' })
	})

	/**
	 * O CASO QUE PEGA O INCIDENTE. O serviço que o resolvedor devolve MUDA entre um check e outro —
	 * exatamente o que uma re-registração de singleton faz. Um check que tivesse guardado o primeiro
	 * reportaria `down` para sempre sobre um objeto que ninguém mais usa.
	 */
	it('PHC-03: segue a instância ATUAL quando o container troca o singleton', async () => {
		let current = service(false)
		const check = new PollingHealthCheck('x', () => current)

		expect((await check.check()).status, 'a instância do boot está parada').toBe('down')

		// O que a segunda `registerAll` faz: outra instância passa a ser a do token.
		current = service(true)

		expect((await check.check()).status, 'o check tem de ver a instância NOVA — a que alguém iniciou de verdade').toBe('up')
	})

	/**
	 * E a direção inversa, que importa igual: um dispatcher que MORRE depois do boot tem de aparecer.
	 * Um retrato tirado no boot diria `up` sobre um poller que já parou — pior que o incidente, porque
	 * o operador confiaria no verde.
	 */
	it('PHC-04: e vê o serviço PARAR — um retrato do boot mentiria para o outro lado', async () => {
		const live = { running: true } as { running: boolean }
		const check = new PollingHealthCheck('x', () => live as PollingService)

		expect((await check.check()).status).toBe('up')
		live.running = false
		expect((await check.check()).status, 'um poller que parou depois do boot tem de virar down').toBe('down')
	})

	it('PHC-05: o resolvedor só roda no CHECK — construir não resolve nada', () => {
		let resolved = 0
		const check = new PollingHealthCheck('x', () => {
			resolved++
			return service(true)
		})

		expect(resolved, 'resolver no construtor é literalmente o defeito: congela a instância do boot').toBe(0)
		void check
	})
})
