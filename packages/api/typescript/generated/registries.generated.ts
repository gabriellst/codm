// GERADO por `bun contexts:sync` a partir dos `src/<ctx>/context.ts` — NÃO EDITE.
// O gate é `bun contexts:check`.
//
// O mapa de registries por contexto, e o merge que o boot e o TestBed consomem. Escrito à mão até a
// F2, onde o `satisfies Record<ContextId, InstanceRegistry>` já garantia a COBERTURA (um contexto
// faltando era erro de compilação) mas não o PAREAMENTO: `auth: billingRegistry` compilava limpo.
// Aqui a chave, o alias e o especificador de módulo interpolam o MESMO binding na mesma iteração —
// o defeito deixou de poder existir, em vez de ser detectado.
//
// A ordem é BOOT_ORDER e é semântica: o merge abaixo é por ordem de inserção, e `shared` (o kernel)
// vem primeiro para que bindings de contexto possam sobrescrever defaults do kernel.
import type { ContextId } from '@codm/contracts/context-ids'
import type { InstanceRegistry } from '@codm/core-typescript'
import { INSTANCE_REGISTRY as sharedRegistry } from '@shared/registry'
import { INSTANCE_REGISTRY as agentRegistry } from '@agent/registry'
import { INSTANCE_REGISTRY as artifactRegistry } from '@artifact/registry'
import { INSTANCE_REGISTRY as authRegistry } from '@auth/registry'
import { INSTANCE_REGISTRY as issueRegistry } from '@issue/registry'
import { INSTANCE_REGISTRY as ownerRegistry } from '@owner/registry'
import { INSTANCE_REGISTRY as threadRegistry } from '@thread/registry'
import { INSTANCE_REGISTRY as workspaceRegistry } from '@workspace/registry'
import { INSTANCE_REGISTRY as uiRegistry } from '@ui/registry'
import { INSTANCE_REGISTRY as externalRegistry } from '@external/registry'

export const CONTEXT_REGISTRIES = {
	shared: sharedRegistry,
	agent: agentRegistry,
	artifact: artifactRegistry,
	auth: authRegistry,
	issue: issueRegistry,
	owner: ownerRegistry,
	thread: threadRegistry,
	workspace: workspaceRegistry,
	ui: uiRegistry,
	external: externalRegistry,
} satisfies Record<ContextId, InstanceRegistry>

const merge = (env: keyof InstanceRegistry) => Object.values(CONTEXT_REGISTRIES).flatMap(registry => registry[env])

export const ALL_REGISTRIES: InstanceRegistry = {
	mock: merge('mock'),
	integration: merge('integration'),
	real: merge('real'),
	e2e: merge('e2e'),
}
