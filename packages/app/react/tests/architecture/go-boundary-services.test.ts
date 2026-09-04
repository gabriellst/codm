import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { getBaseUrl } from '@codm/client-typescript/http'
import { health, createWhatsAppChannel } from '@codm/client-typescript/go'
import { useIntegrationBackend, INTEGRATION_BOOT_TIMEOUT_MS, RUNNING_CROSS_SERVICE_LANE } from '../support/integration-harness'
import type { IntegrationBackend } from '../support/integration-harness'

/**
 * RAIL — CASO (b) do AC-8, COM opt-in (spec .specs/2026-08-10-eixo-ambiente-go-design.md
 * Decision 9/11): `useIntegrationBackend({ services: ['apiGo'], identity: 'double' })` sobe o gateway Go como
 * subprocesso real (receita `template.config.ts`'s `WORKSPACES.apiGo.testBoot`, T7) e a fronteira
 * do harness aprende a apontar `configureClient`'s `go` para ele — o caso positivo do stub 501
 * (`go-boundary.test.ts`, caso (a)).
 *
 * PROCESSO PRÓPRIO, de propósito — mirror EXATO da exclusão que T7 já fez para
 * `packages/api/typescript/tests/support/cross-service.spike.test.ts` (ver aquele arquivo + o
 * `bunfig.toml` de lá): T7's law é UM backend por processo — o boot COM `services` é uma decisão do
 * PRIMEIRO `startIntegrationBackend`/`useIntegrationBackend` do processo, e a suíte default do react
 * já boota (via `go-boundary.test.ts` e todo o resto) SEM `services` para ficar byte-idêntica em
 * tempo (spec D9: "default sem services fica byte-idêntico"). Rodar o caso (b) misturado ali
 * violaria a lei ou contaminaria o tempo de boot default com um `go build` + spawn real. A exclusão
 * mora em `packages/app/react/bunfig.toml` (`pathIgnorePatterns`) + `test:cross-service` em
 * `package.json`, chamado pelo target `test` do `project.json` — leia os três, são o MESMO padrão
 * do T7, só que do lado react.
 *
 * A asserção: `health()` — a MESMA função da SDK que o caso (a) usa para provar o 501 — chamada
 * aqui responde do GATEWAY REAL (200, corpo com `components.db.status === 'up'`, o SQLite
 * compartilhado que o subprocesso abriu no MESMO `CODM_DATA_DIR` do backend TS), nunca mais o stub.
 * `backend.services.apiGo` (a URL que `startIntegrationBackend` devolve) é o mesmo campo que
 * `integration-harness.ts`'s `useIntegrationBackend` lê para decidir a URL do Go — esta suíte prova
 * que a decisão realmente aconteceu, batendo na SDK real em vez de inspecionar a URL configurada.
 *
 * MEDIDO, não assumido (T8): a primeira versão desta suíte chamava `health()` direto e via happy-dom
 * bloquear com `Cross-Origin Request Blocked` — o gateway Go não emite cabeçalhos CORS (nunca é
 * chamado por um browser diretamente; produção sempre passa pelo proxy `forwardToChannel` do lado
 * TS). `useIntegrationBackend` resolve isso substituindo `globalThis.fetch` por uma implementação
 * `node:http` (sem modelo de segurança de browser) pela duração inteira da sessão `services` — ver o
 * docblock ali para os dois call sites que precisavam disso (o próprio poll de boot já quebrava do
 * mesmo jeito). Esta suíte não repete esse mecanismo, só se beneficia dele.
 *
 * FALSEADO durante o T8 (não codificado aqui — mudanças transitórias, revertidas): (1) apontar `go`
 * de volta para o stub (`configureClient({ go: <stub-url> })` depois do `useIntegrationBackend`) fez
 * `health()` lançar com `.status === 501` — RED — revertido, GREEN de novo; (2) matar o subprocesso
 * do gateway (`backend.services` continua com a entrada, mas o processo morreu) fez `health()`
 * lançar por conexão recusada — RED — revertido (novo boot), GREEN de novo. Ver o relato da Task T8
 * para os números.
 *
 * O TESTE ABAIXO (`carrega o body de um POST`, T9/T12) é o REGRESSION deste rail para um defeito que
 * `health()` sozinho NUNCA teria pego: `ky` (o transporte por trás de TODA função gerada) sempre
 * normaliza uma mutation numa instância de `Request` e chama `fetch(request, extra)` — um SEGUNDO
 * argumento sem method/headers/body (traçado em `node_modules/.bun/ky@1.14.3/node_modules/ky/
 * distribution/core/Ky.js`, `#fetch()`). O `nodeHttpFetch` original de `integration-harness.ts` só
 * lia esses três campos do `init` (segundo argumento) — nunca de `input` quando `input` É o
 * `Request` — então TODA mutation da SDK em modo `services` degradava silenciosamente para um GET
 * sem corpo, invisível neste arquivo porque `health()` é a ÚNICA chamada (e é GET). Isso só foi
 * descoberto quando T9 tentou uma mutation real (`createWhatsAppChannel`) através deste mesmo
 * harness. Corrigido em `integration-harness.ts` (`input instanceof Request` vira seu próprio
 * caminho — method/headers/body lidos DO Request, `init` ganha em conflito de header, body via
 * `.clone().arrayBuffer()`); este teste chama a SDK DIRETO, sem `client` override nenhum — a MESMA
 * forma que qualquer given/mutation chamaria — e prova que o `name` enviado sobrevive a viagem de
 * ida e volta. Falseado durante a autoria (T9): comentar o branch `instanceof Request` de volta ao
 * original fez este `it` falhar com `Invalid UUID`/`validation failed` do lado Go (o corpo sumia) —
 * RED — restaurado, GREEN de novo.
 */
/**
 * SO NA LANE CROSS-SERVICE. Esta suite faz `go build` + spawn de subprocesso e boota o backend COM
 * `services`, e a lei de um-backend-por-processo a torna incompativel com a suite padrao. O
 * `pathIgnorePatterns` do `bunfig.toml` existia para isso e e INERTE (medido: bun 1.3.4 no Windows,
 * nenhum padrao exclui nada) — ver o docblock de `RUNNING_CROSS_SERVICE_LANE`. A guarda declarada
 * vale igual nos dois SOs; `scripts/test-cross-service.ts` e quem liga a flag, um processo por arquivo.
 */
describe.skipIf(!RUNNING_CROSS_SERVICE_LANE)('rail: com services["apiGo"], o boundary do Go aponta pro subprocesso real', () => {
	let backend: IntegrationBackend

	beforeAll(async () => {
		backend = await useIntegrationBackend({ services: ['apiGo'], identity: 'double' })
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	afterAll(async () => {
		await backend.stop()
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	it('o backend reporta a URL do subprocesso do gateway', () => {
		expect(backend.services.apiGo).toBeDefined()
		expect(backend.services.apiGo).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
	})

	it('configureClient aponta o Go pro subprocesso real — não mais o stub 501', () => {
		const goUrl = getBaseUrl('go')
		expect(goUrl).toBeDefined()
		expect(goUrl).toBe(`${backend.services.apiGo}/api`)
	})

	it('a SDK real chamando um endpoint Go responde do gateway — leitura do MESMO SQLite compartilhado', async () => {
		const result = await health()

		expect(result.status).toBeDefined()
		expect(result.components.db?.status).toBe('up')
	})

	it('uma mutation real (POST com corpo) carrega o body pelo fetch remendado — regression do bug T9/T12', async () => {
		const ownerId = backend.asTestBed().ownerId
		const name = 'go-boundary-services-body-regression'

		const created = await createWhatsAppChannel({ name }, { baseURL: `${backend.services.apiGo}/api`, headers: { 'X-Owner-Id': ownerId } })

		expect(created.id).toBeDefined()
		expect(created.name).toBe(name)
	})
})
