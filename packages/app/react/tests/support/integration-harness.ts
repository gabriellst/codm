import { configureClient } from '@codm/client-typescript/http'
import type { IntegrationBackend, TestBedLike } from '@codm/api-typescript/testing-contract'

/**
 * A casca do console sobre o servidor de integração: sobe (uma vez por processo — o servidor
 * cacheia), aponta a SDK para ele e devolve o backend. Givens são compostos pelo TESTE
 * (`givenX(backend.asTestBed(), …)`) — a casca não os conhece (spec AC-3).
 *
 * DUAS metades, de propósito (founder correction, spec Decision 5/6):
 *
 * - `import type { IntegrationBackend } from '@codm/api-typescript/testing-contract'` acima é um
 *   import de TIPO — some por completo na emissão. O contrato em si não importa nenhum alias
 *   interno do api (ver `integration-contract.ts`), então este `tsc` nunca precisa entender a
 *   estrutura interna do backend (decorators do tsyringe-neo, `@auth/*`, etc.) para tipar isto.
 *
 * - A IMPLEMENTAÇÃO é alcançada por `import()` DINÂMICO com especificador COMPUTADO
 *   (`spec = '@codm/api-typescript' + '/testing'`), nunca um literal: um literal deixaria o `tsc`
 *   do react seguir o import estaticamente (mesmo sendo `import()`) e tentar tipar o módulo alvo —
 *   que arrastaria o grafo inteiro do backend de volta para dentro do `tsc` deste workspace, exatamente
 *   o que este harness existe para NÃO fazer. Em runtime, `import()` sempre resolve a STRING (o bun
 *   nem sabe se veio de um literal ou de uma concatenação) — só o `tsc` estático se importa com a
 *   forma da expressão.
 */
export type { IntegrationBackend, TestBedLike }

interface IntegrationTestingModule {
	startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend>
	createGivenHelpers(bed: TestBedLike): unknown
	givenThread(bed: TestBedLike, overrides?: Record<string, unknown>): Promise<unknown>
}

async function loadIntegrationTestingModule(): Promise<IntegrationTestingModule> {
	const spec = '@codm/api-typescript' + '/testing'
	return (await import(/* @vite-ignore */ spec)) as IntegrationTestingModule
}

export async function useIntegrationBackend(): Promise<IntegrationBackend> {
	const { startIntegrationBackend } = await loadIntegrationTestingModule()
	const backend = await startIntegrationBackend()
	configureClient({ typescript: backend.url, go: backend.url })
	return backend
}

/**
 * O compositor de givens do backend, para quem o teste consumidor precisa semear estado direto via
 * repositório (nunca via use case) — ver `@codm/api-typescript` `tests/support/given`. Reexportado
 * por este mesmo caminho computado porque o react não tem alias para os fontes do api (spec
 * Decision 5/6): o teste consumidor não importa `given/index.ts` diretamente, importa daqui.
 */
export async function loadBackendGivens(): Promise<Pick<IntegrationTestingModule, 'createGivenHelpers' | 'givenThread'>> {
	const { createGivenHelpers, givenThread } = await loadIntegrationTestingModule()
	return { createGivenHelpers, givenThread }
}
