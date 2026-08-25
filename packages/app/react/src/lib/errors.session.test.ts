import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { useCloudSessionStore } from '@/stores'
import { handleApiError, handleError } from './errors'

/**
 * UM 401 LEVA O OPERADOR AO LOGIN — e o caminho é o que estes casos protegem.
 *
 * O `CloudSessionGate` já é o dono de "para onde vai um operador sem sessão": ele renderiza
 * `<Navigate to="/login" replace />` quando o store diz `unauthenticated`. O handler de erro não
 * navega — ele diz a verdade ao store, e o redirecionamento acontece pelo mecanismo que já existia.
 *
 * É por isso que estes casos asseguram sobre o STORE e não sobre uma rota: navegar seria um segundo
 * mecanismo para a mesma decisão, e o dia em que os dois discordassem ninguém saberia qual manda.
 * Testar o store é testar a única escrita que existe.
 *
 * O repo de referência (fork de origem) resolve isto importando um SINGLETON de router e chamando
 * `router.navigate({ to: ... })`. Não porta: lá o módulo do router é livre de efeito colateral de
 * propósito; aqui ele roda `configureZod()`/`configureClient()` no escopo do módulo e exporta uma
 * FÁBRICA, porque este console é `@tanstack/react-start`. A regra porta; a forma não.
 */
describe('erro de sessão → o store diz `unauthenticated`, e o gate leva ao login', () => {
	beforeEach(() => {
		useCloudSessionStore.setState({ status: 'authenticated' })
	})

	afterEach(() => {
		useCloudSessionStore.setState({ status: 'checking' })
	})

	it('SES-01: UNAUTHORIZED do backend derruba a sessão', () => {
		handleError('UNAUTHORIZED')
		expect(useCloudSessionStore.getState().status).toBe('unauthenticated')
	})

	it('SES-02: SESSION_EXPIRED — o gêmeo só-frontend — chega ao mesmo lugar', () => {
		handleError('SESSION_EXPIRED')
		expect(useCloudSessionStore.getState().status).toBe('unauthenticated')
	})

	it('SES-03: e pelo caminho REAL — um erro de API com `name: UNAUTHORIZED`', () => {
		// É assim que o erro chega de verdade: as duas caches do `router.tsx` chamam `handleApiError`
		// com o que o cliente gerado lançou. Um teste que só exercitasse `handleError` provaria o mapa
		// e não a extração do código, que é metade do caminho.
		handleApiError({ name: 'UNAUTHORIZED', status: 401, message: 'no session' })
		expect(useCloudSessionStore.getState().status).toBe('unauthenticated')
	})

	it('SES-04: um erro QUALQUER não derruba a sessão', () => {
		// O contraprova que impede o gate de virar uma armadilha: se qualquer falha deslogasse, um 500
		// transitório expulsaria o operador do console no meio do trabalho.
		handleError('VALIDATION_ERROR')
		expect(useCloudSessionStore.getState().status).toBe('authenticated')
	})

	it('SES-05: nem uma falha de INFRAESTRUTURA — o daemon calado não é sessão morta', () => {
		// NETWORK_ERROR é "o daemon não respondeu". Tratar isso como logout mandaria o operador para a
		// tela de login toda vez que o sidecar reiniciasse, e a sessão dele está intacta.
		handleError('NETWORK_ERROR')
		expect(useCloudSessionStore.getState().status).toBe('authenticated')
	})

	it('SES-07: CLOUD_UNREACHABLE derruba a sessão — e a fronteira com o SES-05 é o ponto', () => {
		// A DOENÇA, medida pela suíte e2e depois que ela voltou a rodar (F7): este código não estava
		// mapeado, caía no handler default (um toast), e ninguém navegava. O `OnboardingGate` decide
		// pelo `completedAt` de uma leitura que também foi recusada — `data` indefinido — e o `!data`
		// dele RENDERIZA os filhos. Resultado: numa falha de identidade o operador via o shell do
		// console sem que identidade nenhuma tivesse sido verificada, e a spec 06 recebia /dashboard
		// onde esperava /onboarding.
		//
		// POR QUE AQUI E NÃO NO SES-05: `NETWORK_ERROR` é o DAEMON LOCAL calado — a sessão do operador
		// segue intacta, e deslogar a cada reinício do sidecar seria a armadilha que aquele caso
		// impede. `CLOUD_UNREACHABLE` é o oposto: o daemon RESPONDEU, dizendo que não consegue
		// confirmar quem é o operador. A validade da sessão passa a ser DESCONHECIDA, e o ADR 0001 é
		// explícito sobre o que fazer com desconhecido — "sem identidade o middleware RECUSA... não
		// existe identidade de consolação". Silêncio e recusa não são o mesmo fato.
		handleError('CLOUD_UNREACHABLE')
		expect(useCloudSessionStore.getState().status).toBe('unauthenticated')
	})

	it('SES-06: repetir é inócuo — N queries falhando juntas convergem no mesmo estado', () => {
		// Toda query em voo devolve 401 de uma vez. O handler tem de ser idempotente, senão a corrida
		// com o efeito do gate (que lê o keychain no mount) não teria como convergir.
		handleError('UNAUTHORIZED')
		handleError('UNAUTHORIZED')
		handleError('UNAUTHORIZED')
		expect(useCloudSessionStore.getState().status).toBe('unauthenticated')
	})
})
