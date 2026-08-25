import { describe, expect, test } from 'bun:test'
import { container, inject, injectable } from 'tsyringe-neo'
import { Controller, Router, z } from '@codm/core-typescript'

/**
 * PH-A — a fase A (`bindContexts`) falha ALTO, e nomeia o controller.
 *
 * A invariante do ADR 0007 (decisão 3) estava IMPLEMENTADA em `core/src/types/Router.ts` e
 * DESGUARDADA: nenhum teste do repo referenciava `bindContexts`/`composeContexts`, medido em
 * 2026-08-17. Implementado-e-desguardado é a mesma classe de buraco que esta sessão encontrou nos
 * rails WIRE (verdes vendo zero arquivos) e nas frestas de typecheck da F1 — só que ao contrário: lá
 * o gate existia sem sujeito, aqui o sujeito existe sem gate.
 *
 * O que ela protege, com o custo já medido em produção: o `catch` daquele laço um dia ENGOLIA a
 * falha, e engolir tem um preço exato — um controller que não resolve simplesmente SOME da rota. O
 * boot termina verde, o processo sobe, e o defeito reaparece como 404 numa rota que o desenvolvedor
 * jurava ter registrado, ou como 500 na primeira chamada. Foi metade do mecanismo do 500 do callback
 * do Google.
 *
 * A composição em duas fases mata a CAUSA (token sem binding no meio da montagem); esta mensagem
 * mata o SILÊNCIO, que é o que fez a causa sobreviver tanto tempo sem ser vista. Este teste guarda a
 * segunda metade — a primeira não adianta se a falha voltar a ser um `console.warn`.
 *
 * NOTA SOBRE A ESCOLHA DO DEFEITO PLANTADO: o colaborador ausente é um TOKEN sem binding, não uma
 * classe abstrata. `abstract` é apagado na compilação, então o tsyringe INSTANCIA uma classe abstrata
 * sem reclamar e o defeito só aparece depois, quando falta o método — que é o outro meio-mecanismo
 * descrito no comentário do Router. Um token não registrado é o caso que falha na resolução, que é o
 * que este rail precisa exercitar.
 *
 * Este rail vive no core PORTÁVEL: quando a W2 subir o `Router` para o `template-fullstack`, ele sobe
 * junto e a F5 herda o falseador da condição (5) já provado, em vez de o autorar lá.
 */

const UNBOUND_TOKEN = Symbol('colaborador-que-ninguem-ligou')

const ProbeInputSchema = z.object({})
const ProbeOutputSchema = z.object({ ok: z.boolean() })

@injectable()
class ProbeController extends Controller<typeof ProbeInputSchema, typeof ProbeOutputSchema> {
	readonly path = '/probe'
	readonly method = 'get' as const
	readonly description = 'existe só para não resolver'
	readonly inputSchema = ProbeInputSchema
	readonly outputSchema = ProbeOutputSchema

	constructor(@inject(UNBOUND_TOKEN) private readonly ausente: unknown) {
		super()
	}

	async handle() {
		return { status: 200 as const, data: { ok: Boolean(this.ausente) } }
	}
}

describe('PH-A: a fase A falha alto e nomeia o controller (ADR 0007, decisão 3)', () => {
	test('um controller cujo token não tem binding DERRUBA a montagem — não some da rota em silêncio', () => {
		const child = container.createChildContainer()

		let erro: Error | undefined
		try {
			new Router('probe-router', child, { ProbeController })
		} catch (e) {
			erro = e as Error
		}

		expect(erro, 'a montagem passou em silêncio — o controller sumiria da rota e o boot ficaria verde').toBeDefined()
		// O valor do rail está no CONTEÚDO da mensagem: um throw genérico não diz onde olhar.
		expect(erro?.message).toContain('ProbeController')
		expect(erro?.message).toContain('probe-router')
		expect(erro?.message).toContain('fase A')
	})

	test('contraprova: com o token ligado, a mesma montagem passa', () => {
		const child = container.createChildContainer()
		child.registerInstance(UNBOUND_TOKEN, { agora: 'existe' })

		expect(() => new Router('probe-router', child, { ProbeController })).not.toThrow()
	})
})
