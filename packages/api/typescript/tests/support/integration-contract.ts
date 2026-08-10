/**
 * O CONTRATO TIPADO do harness de integração (spec Decision 5/6 — founder correction, T3).
 *
 * ZERO imports de aliases internos do api (`@auth/*`, `@shared/*`, `@codm/core-typescript`, …) —
 * só tipos estruturais. É por isso que o lado react consegue importar este arquivo
 * ESTATICAMENTE (`import type { IntegrationBackend } from '@codm/api-typescript/testing-contract'`)
 * sem o `tsc` do react precisar descer para dentro dos fontes do backend: um `import type` some por
 * completo na emissão, e mesmo que não sumisse, este arquivo não referencia nada que exija os
 * `paths` do api. A IMPLEMENTAÇÃO (`./integration-server`) é sempre alcançada pelo consumidor via
 * `import()` DINÂMICO com especificador COMPUTADO (nunca um literal — um literal deixaria o `tsc`
 * do react seguir o import estaticamente e descer para dentro do backend de novo) — ver a nota em
 * `packages/app/react/tests/support/integration-harness.ts`.
 */

export interface TestBedLike {
	resolve<T>(token: unknown): T
	readonly ownerId: string
}

/** A superfície mínima de container que `IntegrationBackend.container` expõe — estrutural, não o
 *  `DependencyContainer` do tsyringe-neo (que exigiria importar o tipo do pacote). */
export interface IntegrationContainer {
	resolve<T>(token: unknown): T
}

export interface IntegrationBackend {
	url: string
	container: IntegrationContainer
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
}
