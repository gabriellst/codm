// GERADO por `bun contexts:sync` a partir dos `src/<ctx>/context.ts` — NÃO EDITE.
// O gate é `bun contexts:check`.
//
// RUNTIME: importa os barris de todo contexto. O gêmeo inerte é `contexts.generated.ts`, e a
// separação existe para um rail não pagar o tsyringe só para ler o mapa de acoplamento.
//
// `satisfies Record<ContextId, ContextDescriptor>` é o ponto inteiro do arquivo, e continua sendo:
// um contexto a mais ou a menos é ERRO DE COMPILAÇÃO. O que mudou é quem escreve a lista.
import type { ContextId } from '@codm/contracts/context-ids'
import type { ContextDescriptor } from '@shared/descriptor'
import { openapi } from '@codm/core-typescript'
import * as wireEnums from '@codm/contracts-typescript/wire/enums'
import agentControllers from '@agent/controllers'
import * as agentInternalHandlers from '@agent/handlers/internal'
import * as agentExternalHandlers from '@agent/handlers/external'
import { INSTANCE_REGISTRY as agentRegistry } from '@agent/registry'
import { start as agentStart } from '@agent/lifecycle'
import { shutdown as agentShutdown } from '@agent/lifecycle'
import artifactControllers from '@artifact/controllers'
import * as artifactInternalHandlers from '@artifact/handlers/internal'
import * as artifactExternalHandlers from '@artifact/handlers/external'
import { INSTANCE_REGISTRY as artifactRegistry } from '@artifact/registry'
import authControllers from '@auth/controllers'
import * as authInternalHandlers from '@auth/handlers/internal'
import * as authExternalHandlers from '@auth/handlers/external'
import { INSTANCE_REGISTRY as authRegistry } from '@auth/registry'
import externalControllers from '@external/controllers'
import { INSTANCE_REGISTRY as externalRegistry } from '@external/registry'
import issueControllers from '@issue/controllers'
import * as issueInternalHandlers from '@issue/handlers/internal'
import * as issueExternalHandlers from '@issue/handlers/external'
import { AutoArchiveCompletedIssues } from '@issue/jobs'
import { INSTANCE_REGISTRY as issueRegistry } from '@issue/registry'
import ownerControllers from '@owner/controllers'
import * as ownerInternalHandlers from '@owner/handlers/internal'
import * as ownerExternalHandlers from '@owner/handlers/external'
import { INSTANCE_REGISTRY as ownerRegistry } from '@owner/registry'
import sharedControllers from '@shared/controllers'
import { PruneOutbox } from '@shared/jobs'
import { INSTANCE_REGISTRY as sharedRegistry } from '@shared/registry'
import { INFRA_MODULES as sharedInfra } from '@shared/registry'
import { start as sharedStart } from '@shared/lifecycle'
import { shutdown as sharedShutdown } from '@shared/lifecycle'
import threadControllers from '@thread/controllers'
import * as threadInternalHandlers from '@thread/handlers/internal'
import * as threadExternalHandlers from '@thread/handlers/external'
import * as threadCommandHandlers from '@thread/handlers/commands'
import { FireDueLoops } from '@thread/jobs'
import { INSTANCE_REGISTRY as threadRegistry } from '@thread/registry'
import uiControllers from '@ui/controllers'
import * as uiInternalHandlers from '@ui/handlers/internal'
import * as uiExternalHandlers from '@ui/handlers/external'
import { INSTANCE_REGISTRY as uiRegistry } from '@ui/registry'
import workspaceControllers from '@workspace/controllers'
import * as workspaceInternalHandlers from '@workspace/handlers/internal'
import * as workspaceExternalHandlers from '@workspace/handlers/external'
import { INSTANCE_REGISTRY as workspaceRegistry } from '@workspace/registry'
import * as authEnums from '@auth/enums'
import * as sharedEnums from '@shared/enums'
import * as uiEnums from '@ui/enums'
import * as sharedObjects from '@shared/objects'

export const MANIFEST = {
	agent: {
		name: 'agent',
		controllers: agentControllers,
		internalHandlers: agentInternalHandlers,
		externalHandlers: agentExternalHandlers,
		registry: agentRegistry,
		start: agentStart,
		shutdown: agentShutdown,
	},
	artifact: {
		name: 'artifact',
		controllers: artifactControllers,
		internalHandlers: artifactInternalHandlers,
		externalHandlers: artifactExternalHandlers,
		registry: artifactRegistry,
	},
	auth: {
		name: 'auth',
		controllers: authControllers,
		internalHandlers: authInternalHandlers,
		externalHandlers: authExternalHandlers,
		registry: authRegistry,
	},
	external: {
		name: 'external',
		controllers: externalControllers,
		registry: externalRegistry,
	},
	issue: {
		name: 'issue',
		controllers: issueControllers,
		internalHandlers: issueInternalHandlers,
		externalHandlers: issueExternalHandlers,
		jobs: [{ handler: AutoArchiveCompletedIssues }],
		registry: issueRegistry,
	},
	owner: {
		name: 'owner',
		controllers: ownerControllers,
		internalHandlers: ownerInternalHandlers,
		externalHandlers: ownerExternalHandlers,
		registry: ownerRegistry,
	},
	shared: {
		name: 'shared',
		root: true,
		controllers: sharedControllers,
		jobs: [{ handler: PruneOutbox }],
		registry: sharedRegistry,
		infra: sharedInfra,
		start: sharedStart,
		shutdown: sharedShutdown,
	},
	thread: {
		name: 'thread',
		controllers: threadControllers,
		internalHandlers: threadInternalHandlers,
		externalHandlers: threadExternalHandlers,
		commandHandlers: threadCommandHandlers,
		jobs: [{ handler: FireDueLoops }],
		registry: threadRegistry,
	},
	ui: {
		name: 'ui',
		controllers: uiControllers,
		internalHandlers: uiInternalHandlers,
		externalHandlers: uiExternalHandlers,
		registry: uiRegistry,
	},
	workspace: {
		name: 'workspace',
		controllers: workspaceControllers,
		internalHandlers: workspaceInternalHandlers,
		externalHandlers: workspaceExternalHandlers,
		registry: workspaceRegistry,
	},
} satisfies Record<ContextId, ContextDescriptor>

/**
 * O VOCABULÁRIO NOMEADO da spec — enums e value objects registrados como componentes reutilizáveis.
 *
 * DERIVADO dos `exposes` de cada `context.ts`. Antes vivia em `src/openapi.ts`, que importava de
 * quatro contextos e era por isso uma raiz de composição mantida à mão: acrescentar um contexto ao
 * vocabulário significava editar um arquivo que fala de todos, e PODAR um contexto deixava a linha
 * dele órfã — o mesmo defeito que moveu `givens` e `PLACEMENT` para os contextos.
 *
 * Chamado ANTES do guard de emissão: a emissão (`EMIT_OPENAPI=true`) é justamente quem mais precisa
 * destes nomes. O guard existe para não ABRIR INFRA durante a emissão, nunca para pular o registro.
 *
 * Sem isto, componentes de enum ganham nomes gerados como `ReactionType2` quando o fallback por
 * caminho colide com um irmão (cc-bp-13).
 */
export function registerOpenApiVocabulary(): void {
	openapi.registerEnums({ ...wireEnums, ...authEnums, ...sharedEnums, ...uiEnums })
	openapi.registerSchemas({ ...sharedObjects })
}
