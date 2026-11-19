export { AddWorkspaceController } from './AddWorkspace'
export { RemoveWorkspaceController } from './RemoveWorkspace'
export { ListWorkspacesController } from './ListWorkspaces'
// Fase 4 (S0b) — the declared publish command (item 6c): console-only doors, NO `mcpScopes`.
export { SetWorkspacePublishCommandController } from './SetWorkspacePublishCommand'
export { GetWorkspacePublishCommandController } from './GetWorkspacePublishCommand'

import { AddWorkspaceController } from './AddWorkspace'
import { RemoveWorkspaceController } from './RemoveWorkspace'
import { ListWorkspacesController } from './ListWorkspaces'
import { SetWorkspacePublishCommandController } from './SetWorkspacePublishCommand'
import { GetWorkspacePublishCommandController } from './GetWorkspacePublishCommand'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default {
	AddWorkspaceController,
	RemoveWorkspaceController,
	ListWorkspacesController,
	SetWorkspacePublishCommandController,
	GetWorkspacePublishCommandController,
}
