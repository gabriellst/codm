import { injectable } from 'tsyringe-neo'
import {
	BaseError,
	type BaseInfrastructureErrors,
	type BaseInterfaceErrors,
	type HttpControllerRequest,
	type HttpMiddlewareResponse,
	type Middleware,
} from '@codm/core-typescript'
import { CloudSession } from '@shared/services/CloudSession'

/**
 * CloudSessionMiddleware — a identidade vem da NUVEM, e sem ela o daemon não serve nada.
 *
 * ── O QUE ELE SUBSTITUI, e por que isso importa ───────────────────────────────────────────────────
 * O `OperatorMiddleware` carimbava `OPERATOR_ID` — uma CONSTANTE — em `request.ctx`,
 * incondicionalmente. Todo recurso criado nesta máquina carregava, portanto, um `ownerId` cunhado
 * LOCALMENTE: um id que quem tem o disco pode editar. Esse é o buraco que originou o ADR 0001, e
 * nenhum teste o pegava, porque um id constante é perfeitamente consistente consigo mesmo.
 *
 * Agora o `ownerId` é o que a nuvem disse ser, cacheado em disco pelo `CloudSession`. Adulterá-lo
 * localmente não produz um dono diferente — produz uma sessão que a próxima revalidação derruba.
 *
 * ── FALHA FECHADO, e isso é decisão, não conservadorismo ──────────────────────────────────────────
 * Sem identidade o middleware RECUSA. O ADR 0001 é literal: *"numa instalação nunca logada não há
 * token, logo não há `ownerId`, logo não há o que escopar: o daemon serve apenas a superfície de
 * login"*, e assume a consequência de produto — *"não existe experimentar o codm antes de criar
 * conta"*. A alternativa descartada lá (Owner provisório local, reassociado no login) reintroduziria
 * exatamente o id cunhado localmente que este arquivo existe para apagar.
 *
 * Não há identidade de consolação, e não há caminho de dev-compat. Um operador padrão quando a nuvem
 * não está configurada seria a constante de volta, com outro nome.
 *
 * ── PROXY: a pergunta vai À NUVEM, a cada requisição ──────────────────────────────────────────────
 * Este bloco dizia o oposto, e citava o ADR 0001: *"o middleware novo não pode fazer round-trip por
 * request; precisa ser cache-first como o `isEntitled()`"*. Aquilo comprava latência com uma
 * segunda autoridade — um `ownerId` cacheado em disco que podia discordar da nuvem por até uma
 * hora, no arquivo de quem tem a máquina. É a mesma classe de defeito que o ADR existe para apagar,
 * reintroduzida um nível abaixo.
 *
 * Agora `identity()` pergunta à nuvem (`GET /session`, pela classe `Client` do SDK) usando a
 * credencial que o console entregou. O daemon deixa de ter opinião sobre identidade: ele encaminha
 * a pergunta e injeta a resposta. Uma revogação passa a valer no instante seguinte, e não na
 * próxima hora.
 *
 * O CUSTO, dito por extenso: um round-trip à nuvem por requisição, e um daemon que não serve
 * offline. É decisão de produto — "sempre batendo na nuvem, nunca offline" — e reverte a exigência
 * citada acima; o ADR 0001 precisa registrar a emenda.
 *
 * Uma falha de REDE não vira 401 aqui: `identity()` propaga, e a requisição falha como erro de
 * infraestrutura. Responder "não autenticado" porque a internet caiu mandaria o operador refazer
 * login para resolver um problema que não é dele.
 */
@injectable()
export class CloudSessionMiddleware implements Middleware {
	constructor(private readonly cloudSession: CloudSession) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const identity = await this.resolveIdentity()
		// `UNAUTHORIZED` do KERNEL (401), não um código novo. A condição é literalmente "esta requisição
		// não está autenticada" — inventar um `NOT_LOGGED_IN` daria um segundo nome para o mesmo fato e
		// obrigaria o frontend a tratar dois.
		if (identity === null) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')

		request.ctx = {
			...request.ctx,
			user: identity.user,
			session: identity.session,
			ownerId: identity.session.ownerId,
		}
		return {}
	}

	/**
	 * "Não consegui perguntar" ganha NOME antes de sair daqui.
	 *
	 * Um erro sem código atravessa o `GlobalErrorMapper` como `UNKNOWN_ERROR`/500, e a tela mostra
	 * "Erro desconhecido" — que foi literalmente o que o operador viu quando `CODM_CLOUD_URL` estava
	 * ausente e o daemon acabou perguntando a si mesmo. `CLOUD_UNREACHABLE` é 503 e diz a verdade: o
	 * serviço não está utilizável AGORA, por uma razão que não é a credencial de quem chamou.
	 *
	 * Um `BaseError` que já venha de baixo passa intacto — inclusive o `CLOUD_UNREACHABLE` que o
	 * próprio `CloudSession` lança quando não há nuvem configurada, que traz a mensagem nomeando a
	 * env. Só o que chega SEM código é embrulhado, e a causa vai junto na mensagem.
	 */
	private async resolveIdentity() {
		try {
			return await this.cloudSession.identity()
		} catch (error) {
			if (error instanceof BaseError) throw error
			throw new BaseError<BaseInfrastructureErrors>(
				'CLOUD_UNREACHABLE',
				`não consegui falar com a nuvem para resolver a sessão: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
}
